"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { Highlighter, Loader2, RotateCcw, Sparkles } from "lucide-react";

import type { LineOrigin } from "@repo/api/domains/documents/schemas/document";
import type {
  DocumentView,
  VersionView,
} from "@repo/api/domains/documents/schemas/document-view";
import type { CoverLetterContent } from "@repo/api/domains/documents/schemas/cover-letter-content";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
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
import { DownloadPdfDialog } from "./download-pdf-dialog";
import { GenerateLetterDialog } from "./generate-letter-dialog";
import { SyncProposal } from "./language-sync";
import { EditableText, originTone } from "./editing";
import { VersionHistorySheet } from "./version-history-sheet";

/**
 * The cover letter edited in place: the resume's header, then the letter,
 * every paragraph editable and traced to its sources; outdated once its
 * resume changes, with the update offered as a proposal.
 */
export function CoverLetterEditor({
  openingId,
  document,
  resumeVersions,
  defaultTone,
}: {
  openingId: string;
  document: DocumentView;
  resumeVersions: VersionView[];
  defaultTone: Tone;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const version =
    document.versions.find((row) => row.id === selectedId) ??
    document.versions[0];
  const [edits, setEdits] = useState<{
    snapshotId: string;
    content: CoverLetterContent;
  } | null>(null);
  const [trace, setTrace] = useState(false);
  const onError = (error: { message: string }) => toast.error(error.message);
  const save = useMutation(
    trpc.documents.saveEdit.mutationOptions({
      onSuccess: async () => {
        setEdits(null);
        await refresh();
      },
      onError,
    })
  );
  const undo = useMutation(
    trpc.documents.undo.mutationOptions({ onSuccess: refresh, onError })
  );
  const update = useMutation(
    trpc.letters.update.mutationOptions({ onSuccess: refresh, onError })
  );
  const dismiss = useMutation(
    trpc.letters.dismissOutdated.mutationOptions({
      onSuccess: refresh,
      onError,
    })
  );
  if (version?.content.kind !== "cover_letter") return null;

  const draft =
    edits?.snapshotId === version.snapshot.id ? edits.content : null;
  const content = draft ?? version.content;
  const edit = (next: CoverLetterContent) =>
    setEdits({ snapshotId: version.snapshot.id, content: next });
  const generating =
    document.generation?.status === "pending" ||
    document.generation?.status === "running";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {document.versions.length > 1 ? (
          <Tabs value={version.id} onValueChange={setSelectedId}>
            <TabsList>
              {document.versions.map((row) => (
                <TabsTrigger key={row.id} value={row.id}>
                  {labels.version(row)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <span />
        )}
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
          <VersionHistorySheet versionId={version.id} />
          <DownloadPdfDialog key={version.id} version={version} />
          <GenerateLetterDialog
            openingId={openingId}
            resumeVersions={resumeVersions}
            defaultLanguage={version.language}
            defaultTone={defaultTone}
            versionId={version.id}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                disabled={generating || !!draft}
              >
                <Sparkles />
                {t.formatMessage({ defaultMessage: "Generate again" })}
              </Button>
            }
          />
        </div>
      </div>

      {generating && (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          {t.formatMessage({ defaultMessage: "Writing the cover letter…" })}
        </p>
      )}
      {version.letter?.motivationSkipped && (
        <Badge variant="outline" className="self-start">
          {t.formatMessage({
            defaultMessage: "Could improve with your motivation",
          })}
        </Badge>
      )}
      {version.letter?.outdated && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
          <span>
            {t.formatMessage({
              defaultMessage:
                "The resume changed after this letter was written.",
            })}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              disabled={update.isPending}
              onClick={() => update.mutate({ versionId: version.id })}
            >
              {t.formatMessage({ defaultMessage: "Update the cover letter" })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={dismiss.isPending}
              onClick={() => dismiss.mutate({ versionId: version.id })}
            >
              {t.formatMessage({ defaultMessage: "Keep it as it is" })}
            </Button>
          </div>
        </div>
      )}
      <SyncProposal document={document} versions={document.versions} />
      {version.pages > 1 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
          {t.formatMessage(
            {
              defaultMessage:
                "Over one page: a cover letter reads best short. Start with paragraph {position}, the longest.",
            },
            { position: longestParagraph(content) + 1 }
          )}
        </p>
      )}

      {draft && (
        <div className="bg-background sticky top-0 z-10 flex items-center justify-between gap-2 rounded-lg border p-2 text-sm shadow-sm">
          <span>{t.formatMessage({ defaultMessage: "Unsaved changes" })}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEdits(null)}>
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

      <article className="bg-background flex flex-col gap-4 rounded-lg border p-6 text-sm shadow-sm">
        <header className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold text-[#1f3a68] dark:text-sky-300">
            {content.header.name}
          </h2>
          <p className="font-medium">{content.header.titleLine}</p>
          <p className="text-muted-foreground text-xs">
            {[...content.header.contacts, content.header.city]
              .filter(Boolean)
              .join(" | ")}
          </p>
        </header>
        <EditableText
          value={content.greeting}
          onChange={(greeting) => edit({ ...content, greeting })}
        />
        {content.paragraphs.map((line) => (
          <SourcedParagraph
            key={line.id}
            origin={line.origin}
            trace={trace}
            version={version}
          >
            <EditableText
              value={line.text}
              onChange={(text) =>
                edit({
                  ...content,
                  paragraphs: content.paragraphs.map((row) =>
                    row.id === line.id ? { ...row, text } : row
                  ),
                })
              }
            />
          </SourcedParagraph>
        ))}
        <EditableText
          value={content.closing}
          onChange={(closing) => edit({ ...content, closing })}
        />
      </article>
    </div>
  );
}

/** A paragraph with its sources on hover, colored by origin in trace mode. */
function SourcedParagraph({
  origin,
  trace,
  version,
  children,
}: {
  origin: LineOrigin;
  trace: boolean;
  version: VersionView;
  children: React.ReactNode;
}) {
  const t = useTranslation();
  const sources = version.letterTrace;
  const evidence =
    "evidenceIds" in origin
      ? version.trace.filter((row) =>
          origin.evidenceIds.includes(row.evidenceId)
        )
      : [];
  const facts =
    origin.kind === "letter"
      ? (sources?.companyFacts ?? []).filter((row) =>
          origin.companyFactIds.includes(row.id)
        )
      : [];
  const words =
    origin.kind === "letter"
      ? [
          ...(sources?.motivationPoints ?? []).filter((row) =>
            origin.motivationPointIds.includes(row.id)
          ),
          ...(sources?.careerGoals ?? []).filter((row) =>
            origin.careerGoalIds.includes(row.id)
          ),
        ]
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
        ) : (
          <div className="flex flex-col gap-2">
            {evidence.map((row) => (
              <span key={row.evidenceId}>
                {t.formatMessage(
                  { defaultMessage: "“{quote}”" },
                  { quote: row.quote }
                )}
              </span>
            ))}
            {facts.map((row) => (
              <span key={row.id}>
                {t.formatMessage(
                  { defaultMessage: "{fact} (from the company research)" },
                  { fact: row.text }
                )}
              </span>
            ))}
            {words.map((row) => (
              <span key={row.id}>
                {t.formatMessage(
                  { defaultMessage: "“{quote}” (your motivation)" },
                  { quote: row.text }
                )}
              </span>
            ))}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Where trimming helps most: the longest paragraph's index. */
function longestParagraph(content: CoverLetterContent) {
  return content.paragraphs.reduce(
    (longest, line, index, all) =>
      line.text.length > all[longest].text.length ? index : longest,
    0
  );
}
