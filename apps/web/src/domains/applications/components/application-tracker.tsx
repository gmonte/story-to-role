"use client";

import { useState, type ReactNode } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Send, Trash2 } from "lucide-react";

import {
  type ApplicationStatus,
  applicationStatusSchema,
} from "@repo/api/domains/applications/schemas/application";
import type { ApplicationDetail } from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/web/components/ui/collapsible";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/web/components/ui/select";
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
import { ApplicationDetails } from "./application-details";
import { WithdrawDialog } from "./withdraw-dialog";

/**
 * The opening's application in the tracker (tracker spec), as a summary:
 * its status, "Mark as applied" (recording what was sent), what was sent
 * and the next step; the details and the timeline stay folded
 * until asked for. The full tracker comes to the Application step later.
 */
export function ApplicationTracker({ openingId }: { openingId: string }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const applicationId = useOpening(openingId).data?.applicationId;
  const detail = useQuery({
    ...trpc.tracker.get.queryOptions({ applicationId: applicationId ?? "" }),
    enabled: !!applicationId,
  });
  if (!applicationId) {
    return (
      <p className="text-muted-foreground text-xs">
        {t.formatMessage({
          defaultMessage:
            "No application yet. It starts with the first document you write for this opening.",
        })}
      </p>
    );
  }
  if (!detail.data) return null;
  return (
    <TrackerBlock
      key={detail.data.id}
      detail={detail.data}
      openingId={openingId}
    />
  );
}

/** A folded section of the summary. */
function Folded({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Collapsible className="flex flex-col gap-3">
      <CollapsibleTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="group justify-between px-2"
        >
          {label}
          <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
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
  const documentLabels = useDocumentLabels();
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
    <section className="flex flex-col gap-3">
      {detail.external && (
        <Badge variant="outline" className="self-start">
          {t.formatMessage({ defaultMessage: "Applied outside StoryToRole" })}
        </Badge>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={detail.status}
          onValueChange={(status) => {
            if (asksReason(status as ApplicationStatus, detail.status)) {
              setWithdrawing(true);
              return;
            }
            setStatus.mutate({
              applicationId: detail.id,
              status: status as ApplicationStatus,
            });
          }}
        >
          <SelectTrigger className="w-44" size="sm">
            <SelectValue>{labels.status(detail.status)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {statuses.map((status) => (
              <SelectItem key={status} value={status}>
                {labels.status(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!detail.external && detail.status === "in_preparation" && (
          <MarkAppliedDialog applicationId={detail.id} openingId={openingId} />
        )}
      </div>
      <WithdrawDialog
        key={`${detail.id}-${withdrawing}`}
        detail={detail}
        open={withdrawing}
        onOpenChange={setWithdrawing}
      />
      {detail.status === "withdrawn" && (
        <p className="flex flex-col text-xs">
          <span className="text-muted-foreground">
            {t.formatMessage({ defaultMessage: "Why you gave up" })}
          </span>
          <span>
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

      {detail.submissions.length > 0 && (
        <div className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">
            {t.formatMessage({ defaultMessage: "Sent" })}
          </span>
          {detail.submissions.map((submission) => (
            <span key={submission.snapshotId}>
              {t.formatMessage(
                {
                  defaultMessage: "{document} · {version}, as it was on {date}",
                },
                {
                  document:
                    submission.documentKind === "resume"
                      ? t.formatMessage({ defaultMessage: "Resume" })
                      : t.formatMessage({ defaultMessage: "Cover letter" }),
                  version: documentLabels.version(submission),
                  date: t.formatDate(submission.sentAt, {
                    dateStyle: "medium",
                  }),
                }
              )}
            </span>
          ))}
        </div>
      )}

      {(detail.nextEvent ?? detail.nextStep) && (
        <p className="text-xs">
          <span className="text-muted-foreground">
            {t.formatMessage({ defaultMessage: "Next step" })}
          </span>
          <span className="block">
            {detail.nextEvent
              ? t.formatMessage(
                  { defaultMessage: "{event} on {date}" },
                  {
                    event:
                      detail.nextEvent.text ??
                      t.formatMessage({ defaultMessage: "an event" }),
                    date: t.formatDate(detail.nextEvent.occurredAt, {
                      dateStyle: "medium",
                    }),
                  }
                )
              : detail.nextStep}
          </span>
        </p>
      )}

      <Folded label={t.formatMessage({ defaultMessage: "Edit details" })}>
        <ApplicationDetails key={detail.id} detail={detail} />
      </Folded>

      <Folded label={t.formatMessage({ defaultMessage: "Timeline" })}>
        <AddEventForm applicationId={detail.id} />
        <EventsTimeline detail={detail} />
      </Folded>
    </section>
  );
}

/** What happened, with the notes the user can delete. */
function EventsTimeline({ detail }: { detail: ApplicationDetail }) {
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
    <ol className="flex flex-col gap-2 border-l pl-3 text-xs">
      {detail.events.map((event) => (
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
      <div className="flex gap-2">
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
  applicationId: string;
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
  applicationId: string;
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
  const mark = useMutation(
    trpc.tracker.markApplied.mutationOptions({
      onSuccess: async () => {
        await refresh();
        onDone();
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const send = (acknowledgeWarnings: boolean) =>
    mark.mutate({
      applicationId,
      versionIds: selected,
      appliedAt: dayToDate(date),
      acknowledgeWarnings: acknowledgeWarnings || undefined,
    });

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
          disabled={mark.isPending || selected.length === 0}
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
