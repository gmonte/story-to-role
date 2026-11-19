"use client";

import { useState, type ReactNode } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";

import {
  type ApplicationSource,
  type ApplicationType,
  applicationSourceSchema,
  applicationTypeSchema,
} from "@repo/api/domains/applications/schemas/application";
import type { ApplicationDetail } from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Input } from "@repo/web/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/web/components/ui/popover";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";

import { useDocumentLabels } from "~/domains/documents/hooks/use-document-labels";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshTracker } from "../hooks/use-tracker";
import { useTrackerLabels } from "../hooks/use-tracker-labels";
import {
  Empty,
  EditActions,
  GearButton,
  OptionsPopover,
  Section,
} from "./application-section";

type Details = {
  source?: ApplicationSource | null;
  sourceDetail?: string | null;
  applicationType?: ApplicationType | null;
  resumeVersionId?: string | null;
  nextStep?: string | null;
  notes?: string | null;
};

/** Saves some of the application's method fields (notes and next steps are encrypted). */
function useSaveDetails(detail: ApplicationDetail, onSaved?: () => void) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshTracker();
  const mutation = useMutation(
    trpc.tracker.updateDetails.mutationOptions({
      onSuccess: async () => {
        await refresh();
        onSaved?.();
        toast.success(t.formatMessage({ defaultMessage: "Saved" }));
      },
      onError: (error) => toast.error(error.message),
    })
  );
  return {
    pending: mutation.isPending,
    save: (changes: Details) =>
      mutation.mutate({ applicationId: detail.id, ...changes }),
  };
}

const textOrNull = (value: string) => value.trim() || null;

/** Where the user found the opening; "other" asks where. */
export function SourceSection({ detail }: { detail: ApplicationDetail }) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const [editingDetail, setEditingDetail] = useState(false);
  const [sourceDetail, setSourceDetail] = useState(detail.sourceDetail ?? "");
  const { save, pending } = useSaveDetails(detail, () =>
    setEditingDetail(false)
  );
  return (
    <Section
      label={t.formatMessage({ defaultMessage: "Source" })}
      action={
        <OptionsPopover
          label={t.formatMessage({ defaultMessage: "Edit source" })}
          value={detail.source}
          disabled={pending}
          options={applicationSourceSchema.options.map((value) => ({
            value,
            label: labels.sources[value],
          }))}
          onSelect={(source) => {
            save({ source });
            if (source === "other") setEditingDetail(true);
          }}
        />
      }
    >
      {detail.source ? (
        <p className="truncate text-sm">{labels.sources[detail.source]}</p>
      ) : (
        <Empty>{t.formatMessage({ defaultMessage: "Not recorded" })}</Empty>
      )}
      {detail.source === "other" &&
        (editingDetail ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              save({ sourceDetail: textOrNull(sourceDetail) });
            }}
          >
            <Input
              autoFocus
              value={sourceDetail}
              maxLength={200}
              aria-label={t.formatMessage({ defaultMessage: "Source details" })}
              placeholder={t.formatMessage({
                defaultMessage: "Where did you find it?",
              })}
              onChange={(event) => setSourceDetail(event.target.value)}
            />
            <EditActions
              pending={pending}
              onCancel={() => setEditingDetail(false)}
            />
          </form>
        ) : (
          <InlineValue
            value={detail.sourceDetail}
            empty={t.formatMessage({ defaultMessage: "Add details" })}
            onEdit={() => setEditingDetail(true)}
          />
        ))}
    </Section>
  );
}

/** The text of a field, or a link-style action to add it. */
function InlineValue({
  value,
  empty,
  onEdit,
}: {
  value: string | null;
  empty: string;
  onEdit: () => void;
}) {
  const t = useTranslation();
  return value ? (
    <p className="flex min-w-0 items-baseline gap-2 text-sm">
      <span className="truncate">{value}</span>
      <Button
        variant="link"
        size="sm"
        className="h-auto shrink-0 p-0 text-xs"
        onClick={onEdit}
      >
        {t.formatMessage({ defaultMessage: "Edit" })}
      </Button>
    </p>
  ) : (
    <Button
      variant="link"
      size="sm"
      className="h-auto justify-start p-0 text-sm"
      onClick={onEdit}
    >
      {empty}
    </Button>
  );
}

/** Simplified (one click on a job board) or external. */
export function TypeSection({ detail }: { detail: ApplicationDetail }) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const { save, pending } = useSaveDetails(detail);
  return (
    <Section
      label={t.formatMessage({ defaultMessage: "Application type" })}
      action={
        <OptionsPopover
          label={t.formatMessage({ defaultMessage: "Edit application type" })}
          value={detail.applicationType}
          disabled={pending}
          options={applicationTypeSchema.options.map((value) => ({
            value,
            label: labels.types[value],
          }))}
          onSelect={(applicationType) => save({ applicationType })}
        />
      }
    >
      {detail.applicationType ? (
        <p className="text-sm break-words">
          {labels.types[detail.applicationType]}
        </p>
      ) : (
        <Empty>{t.formatMessage({ defaultMessage: "Not recorded" })}</Empty>
      )}
    </Section>
  );
}

/**
 * The versions sent. An external application has no submission, so its
 * resume is picked by hand.
 */
export function SentSection({ detail }: { detail: ApplicationDetail }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const documentLabels = useDocumentLabels();
  const { save, pending } = useSaveDetails(detail);
  const [open, setOpen] = useState(false);
  // An external application, or one marked as applied without any document,
  // says by hand which resume it was sent with.
  const picksByHand =
    (detail.external || detail.status !== "in_preparation") &&
    detail.submissions.length === 0;
  const options = useQuery({
    ...trpc.tracker.resumeVersions.queryOptions({}),
    enabled: picksByHand,
  });
  return (
    <Section
      label={t.formatMessage({ defaultMessage: "Sent" })}
      action={
        picksByHand && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <GearButton
                label={t.formatMessage({ defaultMessage: "Edit resume sent" })}
                disabled={pending}
              />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="flex w-64 flex-col gap-0.5 p-1"
            >
              {(options.data ?? []).map((option) => (
                <Button
                  key={option.versionId}
                  size="sm"
                  variant="ghost"
                  className="min-w-0 justify-start"
                  onClick={() => {
                    setOpen(false);
                    save({ resumeVersionId: option.versionId });
                  }}
                >
                  <span className="truncate">
                    {t.formatMessage(
                      { defaultMessage: "{label} ({language})" },
                      {
                        label:
                          option.label ??
                          t.formatMessage({ defaultMessage: "Resume" }),
                        language: option.language,
                      }
                    )}
                  </span>
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setOpen(false);
                  save({ resumeVersionId: null });
                }}
              >
                {t.formatMessage({ defaultMessage: "Not recorded" })}
              </Button>
            </PopoverContent>
          </Popover>
        )
      }
    >
      {detail.submissions.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {detail.submissions.map((submission) => (
            <li key={submission.snapshotId} className="break-words">
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
            </li>
          ))}
        </ul>
      ) : picksByHand ? (
        detail.resumeSent ? (
          <p className="text-sm break-words">
            {detail.resumeSent.label ??
              t.formatMessage({ defaultMessage: "Resume" })}
          </p>
        ) : (
          <Empty>
            {t.formatMessage({ defaultMessage: "No resume recorded" })}
          </Empty>
        )
      ) : (
        <Empty>
          {t.formatMessage({
            defaultMessage: "Recorded when you mark it as applied.",
          })}
        </Empty>
      )}
    </Section>
  );
}

/** A section whose text is edited in place, with Save and Cancel. */
function TextSection({
  label,
  editLabel,
  value,
  display,
  emptyText,
  addText,
  multiline,
  maxLength,
  placeholder,
  hint,
  pending,
  onSave,
}: {
  label: string;
  editLabel: string;
  value: string | null;
  /** What the section shows besides the stored text. */
  display?: ReactNode;
  emptyText?: string;
  addText?: string;
  multiline?: boolean;
  maxLength: number;
  placeholder?: string;
  hint?: string;
  pending: boolean;
  onSave: (value: string | null, done: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const start = () => {
    setDraft(value ?? "");
    setEditing(true);
  };
  const Field = multiline ? Textarea : Input;
  return (
    <Section
      label={label}
      action={!editing && <GearButton label={editLabel} onClick={start} />}
    >
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(textOrNull(draft), () => setEditing(false));
          }}
        >
          <Field
            autoFocus
            value={draft}
            maxLength={maxLength}
            aria-label={label}
            placeholder={placeholder}
            className={cn(multiline && "min-h-24")}
            onChange={(event) => setDraft(event.target.value)}
          />
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
          <EditActions pending={pending} onCancel={() => setEditing(false)} />
        </form>
      ) : value || display ? (
        display
      ) : addText ? (
        <Button
          variant="link"
          size="sm"
          className="h-auto justify-start p-0 text-sm"
          onClick={start}
        >
          {addText}
        </Button>
      ) : (
        <Empty>{emptyText}</Empty>
      )}
    </Section>
  );
}

/** The next step: a dated event wins over the typed text. */
export function NextStepSection({ detail }: { detail: ApplicationDetail }) {
  const t = useTranslation();
  const [saving, setSaving] = useState<(() => void) | null>(null);
  const { save, pending } = useSaveDetails(detail, () => saving?.());
  return (
    <TextSection
      label={t.formatMessage({ defaultMessage: "Next step" })}
      editLabel={t.formatMessage({ defaultMessage: "Edit next step" })}
      value={detail.nextStep}
      maxLength={2000}
      placeholder={t.formatMessage({
        defaultMessage: "HR interview on Sep 20",
      })}
      addText={t.formatMessage({ defaultMessage: "None yet — add one" })}
      pending={pending}
      onSave={(nextStep, done) => {
        setSaving(() => done);
        save({ nextStep });
      }}
      display={
        detail.nextEvent || detail.nextStep ? (
          <p className="text-sm break-words">
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
          </p>
        ) : null
      }
    />
  );
}

/** Private notes: line-clamped with an expand, encrypted, never sent to the AI. */
export function NotesSection({ detail }: { detail: ApplicationDetail }) {
  const t = useTranslation();
  const [saving, setSaving] = useState<(() => void) | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { save, pending } = useSaveDetails(detail, () => saving?.());
  const long = (detail.notes?.length ?? 0) > 160;
  return (
    <TextSection
      label={t.formatMessage({ defaultMessage: "Notes" })}
      editLabel={t.formatMessage({ defaultMessage: "Edit notes" })}
      value={detail.notes}
      multiline
      maxLength={10_000}
      emptyText={t.formatMessage({ defaultMessage: "None yet" })}
      addText={t.formatMessage({ defaultMessage: "None yet — add some" })}
      hint={t.formatMessage({
        defaultMessage:
          "Notes and next steps are encrypted and never sent to the AI.",
      })}
      pending={pending}
      onSave={(notes, done) => {
        setSaving(() => done);
        save({ notes });
      }}
      display={
        detail.notes ? (
          <div className="flex flex-col items-start gap-1">
            <p
              className={cn(
                "text-sm break-words whitespace-pre-wrap",
                !expanded && "line-clamp-4"
              )}
            >
              {detail.notes}
            </p>
            {long && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded
                  ? t.formatMessage({ defaultMessage: "Show less" })
                  : t.formatMessage({ defaultMessage: "Show more" })}
              </Button>
            )}
          </div>
        ) : null
      }
    />
  );
}
