"use client";

import { useState, type ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";
import {
  Copy,
  CopyPlus,
  Highlighter,
  Languages,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import type { LineOrigin } from "@repo/api/domains/documents/schemas/document";
import type {
  EvidenceTrace,
  VersionView,
} from "@repo/api/domains/documents/schemas/document-view";
import type {
  ResumeContent,
  ResumeSection,
} from "@repo/api/domains/documents/schemas/resume-content";
import {
  credentialLine,
  formatPeriod,
  positionTitleLine,
  sectionTitles,
} from "@repo/api/domains/documents/rendering/output-conventions";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/web/components/ui/dialog";
import { Input } from "@repo/web/components/ui/input";
import { toast } from "@repo/web/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@repo/web/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/web/components/ui/tooltip";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useRefreshDocuments } from "../hooks/use-opening-documents";
import { useSelectedVersion } from "../hooks/use-selected-version";
import {
  addLine,
  removeLine,
  updateLine,
  updateTitleLine,
} from "../utils/edit-content";
import { sectionText } from "../utils/section-text";
import { EditableText, originTone } from "./editing";
import { AdaptVersionDialog } from "./adapt-version-dialog";
import { DownloadPdfDialog } from "./download-pdf-dialog";
import { TitleProposals } from "./title-proposals";
import { VersionHistorySheet } from "./version-history-sheet";

/**
 * The resume edited in place (workspace spec): a tab per version, every
 * line editable, trace mode coloring lines by origin, and the stack of
 * changes behind undo and the change history.
 */
export function ResumeEditor({
  versions,
  generateAgain,
}: {
  versions: VersionView[];
  /** The screen's own "Generate again" dialog, around the given trigger. */
  generateAgain: (version: VersionView, trigger: ReactNode) => ReactNode;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const { selected: version, select } = useSelectedVersion(versions);
  // Edits belong to the snapshot they started from: a new official snapshot
  // (save, undo, restore, generation) leaves them behind.
  const [edits, setEdits] = useState<{
    snapshotId: string;
    content: ResumeContent;
  } | null>(null);
  const [trace, setTrace] = useState(false);

  const onError = (error: { message: string }) => toast.error(error.message);
  const save = useMutation(
    trpc.documents.saveEdit.mutationOptions({
      // Saved edits are a snapshot now; undoing back must not revive them.
      onSuccess: async () => {
        setEdits(null);
        await refresh();
      },
      onError: (error) =>
        toast.error(
          error.data?.code === "CONFLICT"
            ? t.formatMessage({
                defaultMessage:
                  "This version changed elsewhere. Reload to see the latest change.",
              })
            : error.message
        ),
    })
  );
  const undo = useMutation(
    trpc.documents.undo.mutationOptions({ onSuccess: refresh, onError })
  );
  const duplicate = useMutation(
    trpc.documents.duplicate.mutationOptions({
      onSuccess: async ({ versionId }) => {
        await refresh();
        select(versionId);
      },
      onError,
    })
  );
  const remove = useMutation(
    trpc.documents.deleteVersion.mutationOptions({
      onSuccess: refresh,
      onError,
    })
  );

  // This editor shows resumes; cover letters have their own.
  if (version?.content.kind !== "resume") return null;
  const draft =
    edits?.snapshotId === version.snapshot.id ? edits.content : null;
  const setDraft = (content: ResumeContent | null) =>
    setEdits(content && { snapshotId: version.snapshot.id, content });
  const content = draft ?? version.content;
  const language = version.language;
  const traceIndex: TraceIndex = {
    evidence: new Map(version.trace.map((row) => [row.evidenceId, row])),
    instructions: new Map(
      version.instructionTrace.map((row) => [row.instructionId, row.text])
    ),
  };
  const edit = (next: ResumeContent) => setDraft(next);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={version.id} onValueChange={select}>
          <TabsList>
            {versions.map((row) => (
              <TabsTrigger key={row.id} value={row.id}>
                {labels.version(row)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant={trace ? "secondary" : "ghost"}
            onClick={() => setTrace(!trace)}
          >
            <Highlighter />
            {t.formatMessage({ defaultMessage: "Trace mode" })}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={version.snapshotCount < 2 || undo.isPending || !!draft}
            onClick={() => undo.mutate({ versionId: version.id })}
          >
            <RotateCcw />
            {t.formatMessage({ defaultMessage: "Undo" })}
          </Button>
          <RenameVersionDialog
            versionId={version.id}
            label={version.label}
            onRenamed={refresh}
          />
          <VersionHistorySheet versionId={version.id} />
          <DownloadPdfDialog key={version.id} version={version} />
          <Button
            size="sm"
            variant="ghost"
            disabled={duplicate.isPending}
            onClick={() => duplicate.mutate({ versionId: version.id })}
          >
            <CopyPlus />
            {t.formatMessage({ defaultMessage: "Duplicate" })}
          </Button>
          {versions.some((row) => row.language !== version.language) && (
            <AdaptVersionDialog
              // Its choices belong to the version open in the editor.
              key={version.id}
              versions={versions}
              target={version}
              trigger={
                <Button size="sm" variant="ghost">
                  <Languages />
                  {t.formatMessage({ defaultMessage: "Recreate from…" })}
                </Button>
              }
            />
          )}
          {generateAgain(
            version,
            <Button size="sm" variant="ghost">
              <Sparkles />
              {t.formatMessage({ defaultMessage: "Generate again" })}
            </Button>
          )}
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost">
                <Trash2 />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {t.formatMessage({ defaultMessage: "Delete this version?" })}
                </DialogTitle>
                <DialogDescription>
                  {t.formatMessage({
                    defaultMessage:
                      "Every change in it is deleted for good. There is no archive.",
                  })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">
                    {t.formatMessage({ defaultMessage: "Cancel" })}
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    variant="destructive"
                    onClick={() => remove.mutate({ versionId: version.id })}
                  >
                    {t.formatMessage({ defaultMessage: "Delete version" })}
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {trace && (
        <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
          <Legend className="bg-emerald-500">
            {t.formatMessage({ defaultMessage: "Your profile" })}
          </Legend>
          <Legend className="bg-sky-500">
            {t.formatMessage({ defaultMessage: "Application instruction" })}
          </Legend>
          <Legend className="bg-amber-500">
            {t.formatMessage({ defaultMessage: "Written by you" })}
          </Legend>
        </div>
      )}

      <TitleProposals version={version} />

      {draft && (
        <div className="bg-background sticky top-0 z-10 flex items-center justify-between gap-2 rounded-lg border p-2 text-sm shadow-sm">
          <span>{t.formatMessage({ defaultMessage: "Unsaved changes" })}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              {t.formatMessage({ defaultMessage: "Discard" })}
            </Button>
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  versionId: version.id,
                  baseSnapshotId: version.snapshot.id,
                  content: draft,
                })
              }
            >
              {t.formatMessage({ defaultMessage: "Save change" })}
            </Button>
          </div>
        </div>
      )}

      <article className="bg-background flex flex-col gap-5 rounded-lg border p-6 text-sm shadow-sm">
        <header className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold text-[#1f3a68] dark:text-sky-300">
            {content.header.name}
          </h2>
          <NotedLine
            trace={trace}
            note={t.formatMessage({
              defaultMessage:
                "The target title and main technologies, from your published profile",
            })}
          >
            <EditableText
              value={content.header.titleLine}
              onChange={(value) => edit(updateTitleLine(content, value))}
              className="font-medium"
            />
          </NotedLine>
          <p className="text-muted-foreground text-xs">
            {[...content.header.contacts, content.header.city]
              .filter(Boolean)
              .join(" | ")}
          </p>
        </header>

        {content.sections.map((section) => (
          <section key={section.kind} className="flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-[#1f3a68]/40 pb-1">
              <h3 className="text-xs font-semibold tracking-wide text-[#1f3a68] uppercase dark:text-sky-300">
                {sectionTitles[language][section.kind]}
              </h3>
              <CopyButton text={sectionText(section, language)} />
            </div>
            <SectionBody
              section={section}
              content={content}
              language={language}
              trace={trace}
              traceIndex={traceIndex}
              onEdit={edit}
            />
          </section>
        ))}
      </article>
    </div>
  );
}

function Legend({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", className)} />
      {children}
    </span>
  );
}

function SectionBody({
  section,
  content,
  language,
  trace,
  traceIndex,
  onEdit,
}: {
  section: ResumeSection;
  content: ResumeContent;
  language: VersionView["language"];
  trace: boolean;
  traceIndex: TraceIndex;
  onEdit: (content: ResumeContent) => void;
}) {
  const t = useTranslation();
  const line = (row: { id: string; text: string; origin: LineOrigin }) => (
    <TracedLine
      key={row.id}
      origin={row.origin}
      trace={trace}
      traceIndex={traceIndex}
    >
      <EditableText
        value={row.text}
        onChange={(value) => onEdit(updateLine(content, row.id, value))}
      />
    </TracedLine>
  );

  switch (section.kind) {
    case "summary":
      return line(section.line);
    case "skills":
      return (
        <div className="flex flex-col gap-1">
          {section.groups.map((group) => (
            <div key={group.id} className="flex gap-1.5">
              <span className="shrink-0 font-semibold">
                {t.formatMessage(
                  { defaultMessage: "{label}:" },
                  { label: group.label }
                )}
              </span>
              <div className="flex-1">{line(group)}</div>
            </div>
          ))}
        </div>
      );
    case "experience":
    case "projects":
      return (
        <div className="flex flex-col gap-3">
          {section.entries.map((entry) => {
            const ownerId =
              "positionId" in entry ? entry.positionId : entry.projectId;
            return (
              <div key={ownerId} className="flex flex-col gap-1">
                {"positionId" in entry ? (
                  <NotedLine
                    trace={trace}
                    note={t.formatMessage({
                      defaultMessage:
                        "Employer, title and dates: locked facts, as your profile states them",
                    })}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1 font-semibold">
                        {entry.employer}
                        <CopyButton
                          text={sectionText(
                            { kind: "experience", entries: [entry] },
                            language
                          )}
                        />
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatPeriod(entry.startDate, entry.endDate, language)}
                      </span>
                    </div>
                    <span className="italic">{positionTitleLine(entry)}</span>
                  </NotedLine>
                ) : (
                  <span className="font-semibold">{entry.name}</span>
                )}
                {/* A very old experience: the requirement it entered for. */}
                {"positionId" in entry && entry.relevance && (
                  <span className="text-muted-foreground pl-2 text-xs">
                    {t.formatMessage(
                      { defaultMessage: "Included for: {requirement}" },
                      { requirement: entry.relevance }
                    )}
                  </span>
                )}
                <ul className="flex flex-col gap-1 pl-4">
                  {entry.lines.map((row) => (
                    <li key={row.id} className="group flex items-start gap-1">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-current" />
                      <div className="flex-1">{line(row)}</div>
                      <button
                        type="button"
                        className="text-muted-foreground opacity-0 group-hover:opacity-100"
                        title={t.formatMessage({
                          defaultMessage: "Remove line",
                        })}
                        onClick={() => onEdit(removeLine(content, row.id))}
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="text-muted-foreground flex items-center gap-1 self-start pl-4 text-xs hover:underline"
                  onClick={() =>
                    onEdit(
                      addLine(content, ownerId, crypto.randomUUID().slice(0, 8))
                    )
                  }
                >
                  <Plus className="size-3" />
                  {t.formatMessage({ defaultMessage: "Add line" })}
                </button>
              </div>
            );
          })}
        </div>
      );
    default:
      return (
        <ul className="flex flex-col gap-1">
          {section.entries.map((entry) => (
            <li key={entry.credentialId}>
              <NotedLine
                trace={trace}
                note={t.formatMessage({
                  defaultMessage: "A credential, as your profile states it",
                })}
              >
                {credentialLine(entry, language)}
              </NotedLine>
            </li>
          ))}
        </ul>
      );
  }
}

/** Where lines come from: evidence by id and instruction points' text. */
type TraceIndex = {
  evidence: Map<string, EvidenceTrace>;
  instructions: Map<string, string>;
};

/** A line with its origin on hover, colored by origin in trace mode. */
function TracedLine({
  origin,
  trace,
  traceIndex,
  children,
}: {
  origin: LineOrigin;
  trace: boolean;
  traceIndex: TraceIndex;
  children: React.ReactNode;
}) {
  const t = useTranslation();
  const sources =
    origin.kind === "manual" || origin.kind === "credential"
      ? []
      : origin.evidenceIds.flatMap((id) => traceIndex.evidence.get(id) ?? []);
  const instructions =
    origin.kind === "instruction"
      ? origin.instructionIds.flatMap(
          (id) => traceIndex.instructions.get(id) ?? []
        )
      : [];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "rounded-sm border-l-2 border-transparent pl-1.5",
            trace && originTone[origin.kind]
          )}
        >
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-sm">
        {origin.kind === "manual" ? (
          t.formatMessage({ defaultMessage: "Written by you" })
        ) : sources.length > 0 || instructions.length > 0 ? (
          <div className="flex flex-col gap-2">
            {instructions.map((text) => (
              <div key={text} className="flex flex-col gap-0.5">
                <span>
                  {t.formatMessage(
                    { defaultMessage: "“{quote}”" },
                    { quote: text }
                  )}
                </span>
                <span className="opacity-70">
                  {t.formatMessage({
                    defaultMessage: "From this application's instructions",
                  })}
                </span>
              </div>
            ))}
            {sources.map((source) => (
              <div key={source.evidenceId} className="flex flex-col gap-0.5">
                <span>
                  {t.formatMessage(
                    { defaultMessage: "“{quote}”" },
                    { quote: source.quote }
                  )}
                </span>
                <span className="opacity-70">
                  {source.source?.kind === "position"
                    ? t.formatMessage(
                        {
                          defaultMessage:
                            "{title} · {employer} · approved {date}",
                        },
                        {
                          title: source.source.title,
                          employer: source.source.employer,
                          date: t.formatDate(source.approvedAt),
                        }
                      )
                    : source.source?.kind === "credential"
                      ? t.formatMessage(
                          { defaultMessage: "{title} · approved {date}" },
                          {
                            title: source.source.title,
                            date: t.formatDate(source.approvedAt),
                          }
                        )
                      : t.formatMessage(
                          { defaultMessage: "approved {date}" },
                          { date: t.formatDate(source.approvedAt) }
                        )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          t.formatMessage({ defaultMessage: "From your published profile" })
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Renames the version's tab ("Portuguese · copy" becomes anything). */
function RenameVersionDialog({
  versionId,
  label,
  onRenamed,
}: {
  versionId: string;
  label: string | null;
  onRenamed: () => Promise<void>;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(label ?? "");
  const rename = useMutation(
    trpc.documents.renameVersion.mutationOptions({
      onSuccess: async () => {
        await onRenamed();
        setOpen(false);
      },
      onError: (error) => toast.error(error.message),
    })
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={t.formatMessage({ defaultMessage: "Rename tab" })}
        >
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.formatMessage({ defaultMessage: "Rename tab" })}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "A short label shown next to the language. Leave it empty to show only the language.",
            })}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          maxLength={60}
          onChange={(event) => setValue(event.target.value)}
        />
        <DialogFooter>
          <Button
            disabled={rename.isPending}
            onClick={() => rename.mutate({ versionId, label: value })}
          >
            {t.formatMessage({ defaultMessage: "Save" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A line printed by code from the profile (a locked fact, a credential). */
function NotedLine({
  note,
  trace,
  children,
}: {
  note: string;
  trace: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "rounded-sm border-l-2 border-transparent pl-1.5",
            trace && originTone.credential
          )}
        >
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-sm">
        {note}
      </TooltipContent>
    </Tooltip>
  );
}

function CopyButton({ text }: { text: string }) {
  const t = useTranslation();
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-6"
      title={t.formatMessage({ defaultMessage: "Copy text" })}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        toast.success(t.formatMessage({ defaultMessage: "Copied." }));
      }}
    >
      <Copy className="size-3.5" />
    </Button>
  );
}
