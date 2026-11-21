"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  Languages,
  Loader2,
  MessageSquare,
  SearchCheck,
  Send,
  UserPlus,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Input } from "@repo/web/components/ui/input";
import { toast } from "@repo/web/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/web/components/ui/tooltip";
import { cn } from "@repo/web/lib/utils";
import type { AgentAttachment } from "@repo/api/domains/agents/agent-message";

import { useTRPC } from "~/tools/trpc/client";

import { useFindingLabel } from "./coverage-review";
import { useDocumentAgent } from "./document-agent-context";
import {
  useDocumentEditor,
  type DocumentFinding,
  type ProfileAction,
  type ReviewNote,
} from "./document-editor-context";

/**
 * "Add translation" of a "not translated" finding: a small form with the
 * field as printed, whose default is the original itself (no AI), that
 * proposes the entry in the profile's translations dictionary.
 */
function AddTranslation({
  action,
}: {
  action: Extract<ProfileAction, { kind: "translate" }>;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [translation, setTranslation] = useState(action.original);
  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <Languages className="size-3" />
        {t.formatMessage({ defaultMessage: "Add translation" })}
      </Button>
    );
  }
  return (
    <form
      className="flex w-full flex-wrap items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (translation.trim()) action.run(translation.trim());
      }}
    >
      <span className="text-muted-foreground text-xs">
        {t.formatMessage(
          { defaultMessage: "“{original}” →" },
          { original: action.original }
        )}
      </span>
      <Input
        value={translation}
        onChange={(event) => setTranslation(event.target.value)}
        maxLength={300}
        aria-label={t.formatMessage({ defaultMessage: "Translation" })}
        className="h-6 min-w-40 flex-1 text-xs"
        autoFocus
      />
      <Button
        type="submit"
        size="sm"
        className="h-6 px-2 text-xs"
        disabled={action.pending || !translation.trim()}
      >
        {action.pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Send className="size-3" />
        )}
        {t.formatMessage({ defaultMessage: "Send to my profile" })}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground h-6 px-2 text-xs"
        onClick={() => setOpen(false)}
      >
        {t.formatMessage({ defaultMessage: "Cancel" })}
      </Button>
    </form>
  );
}

/**
 * "Add to the profile" of a "not in your profile" finding, "Add
 * translation" of a "not translated" one, or where the line stands in the
 * profile once sent (resume spec, "Document workspace"). Nothing for other
 * findings.
 */
export function ProfileActionButton({
  action,
}: {
  action: ProfileAction | null;
}) {
  const t = useTranslation();
  if (!action) return null;
  if (action.kind === "translate") return <AddTranslation action={action} />;
  if (action.kind === "add") {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-xs"
        disabled={action.pending}
        onClick={action.run}
      >
        {action.pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <UserPlus className="size-3" />
        )}
        {t.formatMessage({ defaultMessage: "Add to the profile" })}
      </Button>
    );
  }
  return (
    <span className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
      {action.status === "pending"
        ? t.formatMessage({
            defaultMessage: "Sent to the profile — accept it there.",
          })
        : t.formatMessage({
            defaultMessage:
              "Accepted in the profile — publish it, then use the new version here.",
          })}
      <Link href="/app/career" className="underline underline-offset-2">
        {t.formatMessage({ defaultMessage: "Open My career" })}
      </Link>
    </span>
  );
}

/** The icon-only "Talk to the agent" of a finding's row, as in the profile. */
function TalkButton({ onClick }: { onClick: () => void }) {
  const t = useTranslation();
  const label = t.formatMessage({ defaultMessage: "Talk to the agent" });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground h-6 px-2 text-xs"
          aria-label={label}
          onClick={onClick}
        >
          <MessageSquare className="size-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The document's findings (resume spec, "Document workspace"): the code
 * checks, which point out and never block, then the AI review's notes;
 * the user may ignore any. Each opens its passage, selected in the text;
 * the active one (opened, or under the pointer in the text) is marked,
 * and a row under the pointer lights its passage up. Fix appears where
 * code fixes it, "Add to the profile" on a line the profile doesn't back,
 * and "Talk to the agent" sends the finding with its passage.
 */
export function DocumentFindings() {
  const t = useTranslation();
  const label = useFindingLabel();
  const trpc = useTRPC();
  const router = useRouter();
  const agent = useDocumentAgent();
  const {
    version,
    findings,
    ignoredFindings,
    notes,
    ignoredNotes,
    ignoreFinding,
    restoreFinding,
    ignoreNote,
    restoreNote,
    fixFor,
    profileActionFor,
    checkProfile,
    checkingProfile,
    profileCheckBusy,
    profileCheckReasons,
    findingKey,
    noteKey,
    activeFinding,
    hoverFinding,
    passageOf,
    goToFinding,
    goToNote,
  } = useDocumentEditor();
  const talk = (
    target: { lineId: string | null; positionId?: string | null },
    attachment: AgentAttachment
  ) => agent?.talkAbout({ quote: passageOf(target), attachment });
  const rowProps = (key: string) => ({
    onMouseEnter: () => hoverFinding(key),
    onMouseLeave: () => hoverFinding(null),
  });
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

  const checkButton = (lineIds?: string[]) => (
    <Button
      size="sm"
      variant="outline"
      className="h-6 px-2 text-xs"
      disabled={profileCheckBusy}
      title={t.formatMessage({
        defaultMessage:
          "Checks again, against the profile published now, whether it backs the lines you wrote or edited",
      })}
      onClick={() => checkProfile(lineIds)}
    >
      {checkingProfile ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <SearchCheck className="size-3" />
      )}
      {t.formatMessage({ defaultMessage: "Check against my profile" })}
    </Button>
  );
  const unbackedLineIds = findings.flatMap((finding) =>
    finding.code === "notInProfile" && finding.lineId ? [finding.lineId] : []
  );
  const reasonOf = (finding: DocumentFinding) => {
    const reason = finding.lineId
      ? profileCheckReasons.get(finding.lineId)
      : undefined;
    if (reason?.text !== finding.text) return null;
    return reason.figures.length > 0
      ? t.formatMessage(
          {
            defaultMessage:
              "Still not in your profile: {figures} isn't marked as measured there.",
          },
          { figures: reason.figures.join(", ") }
        )
      : reason.missing
        ? t.formatMessage(
            { defaultMessage: "Still not in your profile: {missing}" },
            { missing: reason.missing }
          )
        : t.formatMessage({
            defaultMessage: "Still not in your profile.",
          });
  };

  const findingItem = (finding: DocumentFinding) => {
    const fix = fixFor(finding);
    const key = findingKey(finding);
    const text = label(finding, version);
    const anchored = finding.lineId !== null || finding.positionId !== null;
    return (
      <li key={key} className="flex flex-col" {...rowProps(key)}>
        <button
          type="button"
          onClick={() => goToFinding(finding)}
          className={cn(
            "hover:bg-muted text-warning w-full rounded px-2 py-1 text-left text-xs",
            activeFinding === key && "bg-muted"
          )}
        >
          {text}
        </button>
        {reasonOf(finding) && (
          <p className="text-muted-foreground px-2 text-xs">
            {reasonOf(finding)}
          </p>
        )}
        {
          <div className="flex flex-wrap items-center gap-1 px-2 pb-1">
            <ProfileActionButton action={profileActionFor(finding)} />
            {finding.code === "notInProfile" &&
              finding.lineId &&
              checkButton([finding.lineId])}
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
            {agent && anchored && (
              <TalkButton
                onClick={() => talk(finding, { kind: "finding", text })}
              />
            )}
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
          </div>
        }
      </li>
    );
  };

  const noteItem = (note: ReviewNote) => {
    const done = !!note.lineId && sent.includes(note.lineId);
    const key = noteKey(note);
    return (
      <li key={key} className="flex flex-col" {...rowProps(key)}>
        <button
          type="button"
          disabled={!note.lineId}
          onClick={() => goToNote(note)}
          className={cn(
            "text-muted-foreground hover:bg-muted w-full rounded px-2 py-1 text-left text-xs",
            activeFinding === key && "bg-muted"
          )}
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
          {agent && note.lineId && (
            <TalkButton
              onClick={() => talk(note, { kind: "review", text: note.text })}
            />
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
      {open && unbackedLineIds.length > 1 && (
        <div className="mb-1 px-2">{checkButton(unbackedLineIds)}</div>
      )}
      {open && (
        <ul className="space-y-0.5">
          {findings.map(findingItem)}
          {notes.map(noteItem)}
        </ul>
      )}
      {ignoredGroup}
    </section>
  );
}
