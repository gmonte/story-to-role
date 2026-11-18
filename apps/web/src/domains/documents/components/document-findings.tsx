"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, EyeOff, Send, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { isWarningFinding } from "@repo/api/domains/documents/coverage-review/warning-codes";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";

import { useFindingLabel } from "./coverage-review";
import {
  useDocumentEditor,
  type DocumentFinding,
  type ReviewNote,
} from "./document-editor-context";

/**
 * The document's findings (resume spec, "Document workspace"): the code
 * checks first, which block the document until fixed, then the warnings
 * and the AI review's notes, which the user may ignore. Each opens its
 * line; Fix appears where code fixes it.
 */
export function DocumentFindings() {
  const t = useTranslation();
  const label = useFindingLabel();
  const trpc = useTRPC();
  const router = useRouter();
  const {
    version,
    findings,
    ignoredFindings,
    notes,
    ignoredNotes,
    canIgnore,
    ignoreFinding,
    restoreFinding,
    ignoreNote,
    restoreNote,
    fixFor,
    goToLine,
    goToOwner,
  } = useDocumentEditor();
  const [open, setOpen] = useState(true);
  const [showIgnored, setShowIgnored] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const sendToProfile = useMutation(
    trpc.documents.sendToProfile.mutationOptions({
      onSuccess: (_, input) => {
        setSent((rows) => [...rows, input.lineId]);
        toast.success(
          t.formatMessage({
            defaultMessage: "The suggestion is waiting for you in My career.",
          }),
          {
            action: {
              label: t.formatMessage({ defaultMessage: "Open My career" }),
              onClick: () => router.push("/app/career"),
            },
          }
        );
      },
      onError: (error) =>
        toast.error(
          error.data?.code === "CONFLICT"
            ? t.formatMessage({
                defaultMessage: "Your profile already has this line.",
              })
            : t.formatMessage({
                defaultMessage: "This line couldn't be sent to your profile.",
              })
        ),
    })
  );

  const goTo = (target: {
    lineId: string | null;
    positionId?: string | null;
  }) =>
    target.lineId
      ? goToLine(target.lineId)
      : target.positionId && goToOwner(target.positionId);

  const findingItem = (finding: DocumentFinding, key: string) => {
    const fix = fixFor(finding);
    const blocking = !isWarningFinding(finding);
    return (
      <li key={key} className="flex flex-col">
        <button
          type="button"
          onClick={() => goTo(finding)}
          className={cn(
            "hover:bg-muted w-full rounded px-2 py-1 text-left text-xs",
            blocking ? "text-destructive" : "text-amber-700 dark:text-amber-400"
          )}
        >
          {label(finding, version)}
        </button>
        {(fix ?? canIgnore(finding)) && (
          <div className="flex flex-wrap items-center gap-1 px-2 pb-1">
            {fix && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={fix}
              >
                <Wand2 className="size-3" />
                {t.formatMessage({ defaultMessage: "Fix" })}
              </Button>
            )}
            {canIgnore(finding) && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground h-6 px-2 text-xs"
                title={t.formatMessage({
                  defaultMessage: "This finding doesn't apply: stop showing it",
                })}
                onClick={() => ignoreFinding(finding)}
              >
                <EyeOff className="size-3" />
                {t.formatMessage({ defaultMessage: "Ignore" })}
              </Button>
            )}
          </div>
        )}
      </li>
    );
  };

  const noteItem = (note: ReviewNote, index: number) => {
    const done = !!note.lineId && sent.includes(note.lineId);
    return (
      <li key={`note-${index}`} className="flex flex-col">
        <button
          type="button"
          disabled={!note.lineId}
          onClick={() => goTo(note)}
          className="text-muted-foreground hover:bg-muted w-full rounded px-2 py-1 text-left text-xs"
        >
          {note.kind === "inconsistency"
            ? t.formatMessage(
                { defaultMessage: "Inconsistency: {text}" },
                { text: note.text }
              )
            : note.text}
        </button>
        <div className="flex flex-wrap items-center gap-1 px-2 pb-1">
          {note.profileSuggestion && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={done || sendToProfile.isPending}
              onClick={() =>
                note.profileSuggestion &&
                sendToProfile.mutate(note.profileSuggestion)
              }
            >
              <Send className="size-3" />
              {done
                ? t.formatMessage({ defaultMessage: "Sent to my profile" })
                : t.formatMessage({ defaultMessage: "Send to my profile" })}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground h-6 px-2 text-xs"
            onClick={() => ignoreNote(note)}
          >
            <EyeOff className="size-3" />
            {t.formatMessage({ defaultMessage: "Ignore" })}
          </Button>
        </div>
      </li>
    );
  };

  const ignoredCount = ignoredFindings.length + ignoredNotes.length;
  const ignoredGroup = ignoredCount > 0 && (
    <div className="mt-2">
      <button
        type="button"
        className="text-muted-foreground flex items-center gap-1 text-xs font-medium uppercase"
        onClick={() => setShowIgnored((value) => !value)}
      >
        {showIgnored ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        {t.formatMessage(
          { defaultMessage: "Ignored ({count, number})" },
          { count: ignoredCount }
        )}
      </button>
      {showIgnored && (
        <ul className="mt-1 space-y-0.5">
          {ignoredFindings.map((finding, index) => (
            <li key={`ignored-${index}`} className="flex items-start gap-1">
              <span className="text-muted-foreground flex-1 px-2 py-1 text-xs line-through">
                {label(finding, version)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-xs"
                onClick={() => restoreFinding(finding)}
              >
                {t.formatMessage({ defaultMessage: "Restore" })}
              </Button>
            </li>
          ))}
          {ignoredNotes.map((note, index) => (
            <li
              key={`ignored-note-${index}`}
              className="flex items-start gap-1"
            >
              <span className="text-muted-foreground flex-1 px-2 py-1 text-xs line-through">
                {note.text}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-xs"
                onClick={() => restoreNote(note)}
              >
                {t.formatMessage({ defaultMessage: "Restore" })}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const count = findings.length + notes.length;
  if (!count) {
    return (
      <section>
        <p className="text-muted-foreground text-xs">
          {version.coverage
            ? t.formatMessage({
                defaultMessage: "No findings: every check passes.",
              })
            : t.formatMessage({
                defaultMessage: "No checks run on this document.",
              })}
        </p>
        {ignoredGroup}
      </section>
    );
  }

  const blocking = findings.filter((finding) => !isWarningFinding(finding));
  const warnings = findings.filter(isWarningFinding);
  return (
    <section>
      <button
        type="button"
        className="text-muted-foreground mb-1 flex items-center gap-1 text-xs font-medium uppercase"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        {t.formatMessage(
          { defaultMessage: "Findings ({count, number})" },
          { count }
        )}
      </button>
      {open && (
        <>
          {blocking.length > 0 && (
            <p className="text-muted-foreground px-2 pb-1 text-xs">
              {t.formatMessage({
                defaultMessage: "Fix before downloading, sending or copying",
              })}
            </p>
          )}
          <ul className="space-y-0.5">
            {blocking.map((finding, index) =>
              findingItem(finding, `blocking-${index}`)
            )}
            {warnings.map((finding, index) =>
              findingItem(finding, `warning-${index}`)
            )}
            {notes.map(noteItem)}
          </ul>
        </>
      )}
      {ignoredGroup}
    </section>
  );
}
