"use client";

import { useState, type ReactNode } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Plus, Send, Trash2 } from "lucide-react";
import Link from "next/link";

import { applicationStatusSchema } from "@repo/api/domains/applications/schemas/application";
import type { ApplicationDetail } from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/web/components/ui/dialog";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";

import { useDocumentLabels } from "~/domains/documents/hooks/use-document-labels";
import { WarningsDialog } from "~/domains/documents/components/warnings-dialog";
import { hasWarnings } from "~/domains/documents/utils/version-checks";
import { useOpeningDocuments } from "~/domains/documents/hooks/use-opening-documents";
import { useTRPC } from "~/tools/trpc/client";
import { useOpening } from "~/domains/openings/hooks/use-opening";

import { useRefreshTracker } from "../hooks/use-tracker";
import { useTrackerLabels } from "../hooks/use-tracker-labels";
import { dayToDate, today } from "../utils/dates";
import { asksReason } from "../utils/withdraw";
import { OptionsPopover, Section } from "./application-section";
import {
  NextStepSection,
  NotesSection,
  SentSection,
  SourceSection,
  TypeSection,
} from "./application-details";
import { WithdrawDialog } from "./withdraw-dialog";

/**
 * The opening's application in the tracker (tracker spec), as a summary:
 * its status, "Mark as applied" (recording what was sent), what was sent
 * and the next step; the details and the timeline stay folded
 * until asked for. The full tracker comes to the Application step later.
 */
export function ApplicationTracker({ openingId }: { openingId: string }) {
  const trpc = useTRPC();
  const applicationId = useOpening(openingId).data?.applicationId;
  const detail = useQuery({
    ...trpc.tracker.get.queryOptions({ applicationId: applicationId ?? "" }),
    enabled: !!applicationId,
  });
  if (!applicationId) return <NoApplicationYet openingId={openingId} />;
  if (!detail.data) return null;
  return (
    <TrackerBlock
      key={detail.data.id}
      detail={detail.data}
      openingId={openingId}
    />
  );
}

/**
 * An opening with no application yet: the status is shown anyway, and
 * applying or moving it creates the application on the fly, without any
 * document (tracker spec, "Applying without a resume").
 */
function NoApplicationYet({ openingId }: { openingId: string }) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const trpc = useTRPC();
  const refresh = useRefreshTracker();
  const ensure = useMutation(trpc.tracker.ensureForOpening.mutationOptions());
  const setStatus = useMutation(
    trpc.tracker.setStatus.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  const pending = ensure.isPending || setStatus.isPending;
  // What a user moves by hand: "Applied" goes through the dialog, "No
  // response" only comes with time, and the first status is where it is.
  const statuses = applicationStatusSchema.options.filter(
    (status) =>
      status !== "no_response" &&
      status !== "applied" &&
      status !== "in_preparation"
  );
  return (
    <div className="flex min-w-0 flex-col">
      <Section
        label={t.formatMessage({ defaultMessage: "Status" })}
        action={
          <OptionsPopover
            label={t.formatMessage({ defaultMessage: "Change status" })}
            value="in_preparation"
            disabled={pending}
            options={statuses.map((value) => ({
              value,
              label: labels.status(value),
            }))}
            onSelect={async (status) => {
              try {
                const { applicationId } = await ensure.mutateAsync({
                  openingId,
                });
                setStatus.mutate({ applicationId, status });
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : String(error)
                );
              }
            }}
          />
        }
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="secondary">
            {t.formatMessage({ defaultMessage: "Not applied yet" })}
          </Badge>
        </div>
        <MarkAppliedDialog
          applicationId={null}
          openingId={openingId}
          trigger={
            <Button size="sm" className="w-full">
              <Send />
              {t.formatMessage({ defaultMessage: "Mark as applied" })}
            </Button>
          }
        />
        <p className="text-muted-foreground text-xs">
          {t.formatMessage({
            defaultMessage:
              "You can apply without a resume or letter from here. Documents written for this opening are recorded when you mark it as applied.",
          })}
        </p>
        <Button asChild size="sm" variant="link" className="self-start px-0">
          <Link href="?view=resume" scroll={false}>
            <FileText />
            {t.formatMessage({ defaultMessage: "Go to the resume" })}
          </Link>
        </Button>
      </Section>
    </div>
  );
}

function TrackerBlock({
  detail,
  openingId,
}: {
  detail: ApplicationDetail;
  openingId: string;
}) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const trpc = useTRPC();
  const refresh = useRefreshTracker();
  const onError = (error: { message: string }) => toast.error(error.message);
  const setStatus = useMutation(
    trpc.tracker.setStatus.mutationOptions({ onSuccess: refresh, onError })
  );
  // Giving up is the withdrawn status: it asks for the reason first, and
  // cancelling leaves the status as it was.
  const [withdrawing, setWithdrawing] = useState(false);
  // "No response" only comes with time; "Applied" with documents goes
  // through the dialog that records what was sent.
  const statuses = applicationStatusSchema.options.filter(
    (status) =>
      status === detail.status ||
      (status !== "no_response" && (detail.external || status !== "applied"))
  );

  return (
    <div className="flex min-w-0 flex-col">
      <Section
        label={t.formatMessage({ defaultMessage: "Status" })}
        action={
          <OptionsPopover
            label={t.formatMessage({ defaultMessage: "Change status" })}
            value={detail.status}
            disabled={setStatus.isPending}
            options={statuses.map((value) => ({
              value,
              label: labels.status(value),
            }))}
            onSelect={(status) => {
              if (asksReason(status, detail.status)) {
                setWithdrawing(true);
                return;
              }
              setStatus.mutate({ applicationId: detail.id, status });
            }}
          />
        }
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{labels.status(detail.status)}</Badge>
          {detail.external && (
            <Badge variant="outline">
              {t.formatMessage({
                defaultMessage: "Applied outside StoryToRole",
              })}
            </Badge>
          )}
        </div>
        {detail.status === "withdrawn" && (
          <p className="flex min-w-0 flex-col text-xs">
            <span className="text-muted-foreground">
              {t.formatMessage({ defaultMessage: "Why you gave up" })}
            </span>
            <span className="break-words">
              {detail.declineReason ??
                t.formatMessage({ defaultMessage: "No reason recorded" })}
            </span>
            <Button
              variant="link"
              size="sm"
              className="h-auto self-start p-0 text-xs"
              onClick={() => setWithdrawing(true)}
            >
              {t.formatMessage({ defaultMessage: "Edit" })}
            </Button>
          </p>
        )}
        {!detail.external && detail.status === "in_preparation" && (
          <MarkAppliedDialog
            applicationId={detail.id}
            openingId={openingId}
            trigger={
              <Button size="sm" className="w-full">
                <Send />
                {t.formatMessage({ defaultMessage: "Mark as applied" })}
              </Button>
            }
          />
        )}
        <WithdrawDialog
          key={`${detail.id}-${withdrawing}`}
          detail={detail}
          open={withdrawing}
          onOpenChange={setWithdrawing}
        />
      </Section>

      <SourceSection key={`source-${detail.id}`} detail={detail} />
      <TypeSection detail={detail} />
      <SentSection detail={detail} />
      <NextStepSection key={`next-${detail.id}`} detail={detail} />
      <NotesSection key={`notes-${detail.id}`} detail={detail} />
      <TimelineSection detail={detail} />
    </div>
  );
}

const compactEvents = 3;

/** The last entries, with the rest and the form to add one behind a click. */
function TimelineSection({ detail }: { detail: ApplicationDetail }) {
  const t = useTranslation();
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const hidden = detail.events.length - compactEvents;
  return (
    <Section
      label={t.formatMessage({ defaultMessage: "Timeline" })}
      action={
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground size-6"
          aria-label={t.formatMessage({ defaultMessage: "Add entry" })}
          onClick={() => setAdding(!adding)}
        >
          <Plus className="size-3.5" />
        </Button>
      }
    >
      {adding && <AddEventForm applicationId={detail.id} />}
      <EventsTimeline
        detail={detail}
        events={all ? detail.events : detail.events.slice(0, compactEvents)}
      />
      {hidden > 0 && (
        <Button
          variant="link"
          size="sm"
          className="h-auto self-start p-0 text-xs"
          onClick={() => setAll(!all)}
        >
          {all
            ? t.formatMessage({ defaultMessage: "Show less" })
            : t.formatMessage({ defaultMessage: "Show all" })}
        </Button>
      )}
    </Section>
  );
}

/** What happened, with the notes the user can delete. */
function EventsTimeline({
  detail,
  events,
}: {
  detail: ApplicationDetail;
  events: ApplicationDetail["events"];
}) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const trpc = useTRPC();
  const refresh = useRefreshTracker();
  const deleteEvent = useMutation(
    trpc.tracker.deleteEvent.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  return (
    <ol className="flex min-w-0 flex-col gap-2 border-l pl-3 text-xs">
      {events.map((event) => (
        <li key={event.id} className="flex items-start justify-between gap-2">
          <span className="flex flex-col">
            <span className="text-muted-foreground">
              {t.formatDate(event.occurredAt, {
                dateStyle: "medium",
                ...(event.kind === "note" ? { timeStyle: "short" } : {}),
              })}
            </span>
            <span>
              {event.kind === "status_change" && event.toStatus
                ? event.fromStatus
                  ? t.formatMessage(
                      { defaultMessage: "{from} → {to}" },
                      {
                        from: labels.status(event.fromStatus),
                        to: labels.status(event.toStatus),
                      }
                    )
                  : labels.status(event.toStatus)
                : event.text}
            </span>
            {event.kind === "status_change" && event.text && (
              <span className="text-muted-foreground">{event.text}</span>
            )}
          </span>
          {event.kind === "note" && (
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label={t.formatMessage({ defaultMessage: "Delete event" })}
              disabled={deleteEvent.isPending}
              onClick={() =>
                deleteEvent.mutate({
                  applicationId: detail.id,
                  eventId: event.id,
                })
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </li>
      ))}
    </ol>
  );
}

/** "HR interview on Nov 20": a dated event; a future one becomes a reminder. */
function AddEventForm({ applicationId }: { applicationId: string }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshTracker();
  const [text, setText] = useState("");
  const [when, setWhen] = useState("");
  const add = useMutation(
    trpc.tracker.addEvent.mutationOptions({
      onSuccess: async () => {
        setText("");
        setWhen("");
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    })
  );
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate({
          applicationId,
          text,
          occurredAt: when ? new Date(when) : new Date(),
        });
      }}
    >
      <Textarea
        value={text}
        maxLength={2000}
        placeholder={t.formatMessage({
          defaultMessage: "What happened (HR interview, test delivered…)",
        })}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex min-w-0 flex-col gap-2">
        <Input
          type="datetime-local"
          value={when}
          aria-label={t.formatMessage({ defaultMessage: "When" })}
          onChange={(event) => setWhen(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          disabled={add.isPending || !text.trim()}
        >
          {t.formatMessage({ defaultMessage: "Add" })}
        </Button>
      </div>
    </form>
  );
}

/** Marks the application as sent, recording the snapshot of each version. */
export function MarkAppliedDialog({
  applicationId,
  openingId,
  trigger,
}: {
  /** None yet: the application is created when it is marked as applied. */
  applicationId: string | null;
  openingId: string;
  /** The page's own button, instead of the summary's. */
  trigger?: ReactNode;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Send />
            {t.formatMessage({ defaultMessage: "Mark as applied" })}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        {/* Mounted per opening: the choices start fresh each time. */}
        <MarkAppliedForm
          applicationId={applicationId}
          openingId={openingId}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function MarkAppliedForm({
  applicationId,
  openingId,
  onDone,
}: {
  applicationId: string | null;
  openingId: string;
  onDone: () => void;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const documentLabels = useDocumentLabels();
  const refresh = useRefreshTracker();
  const documents = useOpeningDocuments(openingId);
  const versions = (documents.data?.documents ?? []).flatMap((document) =>
    document.versions.map((version) => ({ document, version }))
  );
  const [chosen, setChosen] = useState<string[] | null>(null);
  // Every version comes checked until the user changes it.
  const selected = chosen ?? versions.map(({ version }) => version.id);
  // Sending is the document leaving: one with open findings asks for a
  // confirmation (resume spec, "Document workspace"); the server asks too.
  const warned = versions.some(
    ({ version }) => selected.includes(version.id) && hasWarnings(version)
  );
  const [confirming, setConfirming] = useState(false);
  const [date, setDate] = useState(today());
  const ensure = useMutation(trpc.tracker.ensureForOpening.mutationOptions());
  const mark = useMutation(
    trpc.tracker.markApplied.mutationOptions({
      onSuccess: async () => {
        await refresh();
        onDone();
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const send = async (acknowledgeWarnings: boolean) => {
    let id = applicationId;
    if (!id) {
      try {
        id = (await ensure.mutateAsync({ openingId })).applicationId;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    mark.mutate({
      applicationId: id,
      versionIds: selected,
      appliedAt: dayToDate(date),
      acknowledgeWarnings: acknowledgeWarnings || undefined,
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t.formatMessage({ defaultMessage: "Mark as applied" })}
        </DialogTitle>
        <DialogDescription>
          {t.formatMessage({
            defaultMessage:
              "Check what you sent. Each one is recorded as it was on that day; you can keep editing the documents.",
          })}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        {versions.map(({ document, version }) => (
          <label key={version.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.includes(version.id)}
              onCheckedChange={(checked) =>
                setChosen(
                  checked
                    ? [...selected, version.id]
                    : selected.filter((id) => id !== version.id)
                )
              }
            />
            {t.formatMessage(
              { defaultMessage: "{document} · {version}" },
              {
                document:
                  document.kind === "resume"
                    ? t.formatMessage({ defaultMessage: "Resume" })
                    : t.formatMessage({ defaultMessage: "Cover letter" }),
                version: documentLabels.version(version),
              }
            )}
          </label>
        ))}
        {versions.length === 0 && (
          <p className="text-muted-foreground text-sm">
            {t.formatMessage({
              defaultMessage:
                "No resume or letter was written for this opening. It is recorded without a resume; you can pick one later.",
            })}
          </p>
        )}
        <div className="grid gap-1.5 pt-2">
          <Label htmlFor="applied-on">
            {t.formatMessage({ defaultMessage: "Applied on" })}
          </Label>
          <Input
            id="applied-on"
            type="date"
            max={today()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={mark.isPending || ensure.isPending}
          onClick={() => (warned ? setConfirming(true) : send(false))}
        >
          {t.formatMessage({ defaultMessage: "Mark as applied" })}
        </Button>
        <WarningsDialog
          open={confirming}
          onOpenChange={setConfirming}
          confirmLabel={t.formatMessage({
            defaultMessage: "Mark as applied anyway",
          })}
          onConfirm={() => send(true)}
        />
      </DialogFooter>
    </>
  );
}
