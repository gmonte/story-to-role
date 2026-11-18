"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Highlighter, Plus, RotateCcw, Sparkles, X } from "lucide-react";

import type { Line } from "@repo/api/domains/documents/schemas/document";
import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import type { LinkedinContent } from "@repo/api/domains/documents/schemas/linkedin-content";
import { formatPeriod } from "@repo/api/domains/documents/rendering/output-conventions";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@repo/web/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/web/components/ui/tooltip";

import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useRefreshDocuments } from "../hooks/use-opening-documents";
import { useSelectedVersion } from "../hooks/use-selected-version";
import { WarningsDialog } from "./warnings-dialog";
import { CoverageReviewBlock } from "./coverage-review";
import { EditableText } from "./editing";
import { LinkedinDialog } from "./linkedin-dialog";
import { type TraceIndex, TracedLine } from "./line-trace";
import { hasWarnings } from "../utils/version-checks";
import { VersionHistorySheet } from "./version-history-sheet";

/**
 * The LinkedIn text edited in place (resume spec, "LinkedIn"): the About
 * and each experience, every line editable and traced to the profile. Each
 * section has a Copy text action, which waits for the coverage findings to
 * be fixed and for edits to be saved; nothing is sent to LinkedIn.
 */
export function LinkedinEditor({
  versions,
  defaultTone,
}: {
  versions: VersionView[];
  defaultTone?: Tone;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const { selected: version, select } = useSelectedVersion(versions);
  const [edits, setEdits] = useState<{
    snapshotId: string;
    content: LinkedinContent;
  } | null>(null);
  const [trace, setTrace] = useState(false);
  const onError = (error: { message: string }) => toast.error(error.message);
  const save = useMutation(
    trpc.documents.saveEdit.mutationOptions({
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
  if (version?.content.kind !== "linkedin") return null;

  const draft =
    edits?.snapshotId === version.snapshot.id ? edits.content : null;
  const content = draft ?? version.content;
  const edit = (next: LinkedinContent) =>
    setEdits({ snapshotId: version.snapshot.id, content: next });
  const traceIndex: TraceIndex = {
    evidence: new Map(version.trace.map((row) => [row.evidenceId, row])),
    instructions: new Map(
      version.instructionTrace.map((row) => [row.instructionId, row.text])
    ),
  };
  const warned = hasWarnings(version);
  const copyBlock = draft
    ? t.formatMessage({
        defaultMessage: "Save your changes before copying this text.",
      })
    : null;
  const updateLine = (lineId: string, text: string) =>
    edit({
      ...content,
      about:
        content.about.id === lineId
          ? { ...content.about, text }
          : content.about,
      experiences: content.experiences.map((entry) => ({
        ...entry,
        lines: entry.lines.map((row) =>
          row.id === lineId ? { ...row, text } : row
        ),
      })),
    });
  const line = (row: Line) => (
    <TracedLine
      key={row.id}
      lineId={row.id}
      origin={row.origin}
      trace={trace}
      traceIndex={traceIndex}
    >
      <EditableText
        value={row.text}
        onChange={(text) => updateLine(row.id, text)}
      />
    </TracedLine>
  );

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
          <VersionHistorySheet versionId={version.id} />
          <LinkedinDialog
            defaultLanguage={version.language}
            defaultTone={defaultTone}
            trigger={
              <Button size="sm" variant="ghost" disabled={!!draft}>
                <Sparkles />
                {t.formatMessage({ defaultMessage: "Generate again" })}
              </Button>
            }
          />
        </div>
      </div>

      <CoverageReviewBlock version={version} />

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

      <article className="bg-background flex flex-col gap-5 rounded-lg border p-6 text-sm shadow-sm">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">
              {t.formatMessage({ defaultMessage: "About" })}
            </h3>
            <CopySectionButton
              versionId={version.id}
              section="about"
              blockedBy={copyBlock}
              warned={warned}
            />
          </div>
          {line(content.about)}
        </section>
        {content.experiences.map((entry) => (
          // The anchor a coverage finding about this entry scrolls to.
          <section
            key={entry.positionId}
            data-position-id={entry.positionId}
            className="flex flex-col gap-1 rounded-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-semibold">{entry.title}</span>
                <span className="text-muted-foreground text-xs">
                  {t.formatMessage(
                    { defaultMessage: "{employer} · {period}" },
                    {
                      employer: entry.employer,
                      period: formatPeriod(
                        entry.startDate,
                        entry.endDate,
                        version.language
                      ),
                    }
                  )}
                </span>
              </div>
              <CopySectionButton
                versionId={version.id}
                section={entry.positionId}
                blockedBy={copyBlock}
                warned={warned}
              />
            </div>
            <ul className="flex flex-col gap-1 pl-4">
              {entry.lines.map((row) => (
                <li key={row.id} className="group flex items-start gap-1">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-current" />
                  <div className="flex-1">{line(row)}</div>
                  <button
                    type="button"
                    className="text-muted-foreground opacity-0 group-hover:opacity-100"
                    title={t.formatMessage({ defaultMessage: "Remove line" })}
                    onClick={() =>
                      edit({
                        ...content,
                        experiences: content.experiences.map((other) => ({
                          ...other,
                          lines: other.lines.filter(
                            (candidate) => candidate.id !== row.id
                          ),
                        })),
                      })
                    }
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
                edit({
                  ...content,
                  experiences: content.experiences.map((other) =>
                    other.positionId === entry.positionId
                      ? {
                          ...other,
                          lines: [
                            ...other.lines,
                            {
                              id: crypto.randomUUID().slice(0, 8),
                              text: "",
                              origin: { kind: "manual" },
                            },
                          ],
                        }
                      : other
                  ),
                })
              }
            >
              <Plus className="size-3" />
              {t.formatMessage({ defaultMessage: "Add line" })}
            </button>
          </section>
        ))}
      </article>
    </div>
  );
}

/**
 * Copies one section's text, read from the server so a text with coverage
 * findings never leaves; disabled, with its reason on hover, while it
 * can't be copied.
 */
function CopySectionButton({
  versionId,
  section,
  blockedBy,
  warned,
}: {
  versionId: string;
  section: string;
  /** Only warnings: copying asks for a confirmation first. */
  warned: boolean;
  /** Why copying is unavailable, when it is. */
  blockedBy: string | null;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const copy = async (acknowledgeWarnings?: boolean) => {
    setPending(true);
    try {
      const { text } = await queryClient.fetchQuery({
        ...trpc.linkedin.sectionText.queryOptions({
          versionId,
          section,
          acknowledgeWarnings,
        }),
        staleTime: 0,
      });
      await navigator.clipboard.writeText(text);
      toast.success(t.formatMessage({ defaultMessage: "Copied." }));
    } catch {
      toast.error(
        t.formatMessage({
          defaultMessage:
            "This text couldn't be copied. Check the coverage review.",
        })
      );
    } finally {
      setPending(false);
    }
  };
  const button = (
    <Button
      size="sm"
      variant="ghost"
      disabled={!!blockedBy || pending}
      onClick={() => (warned ? setConfirming(true) : copy())}
    >
      <Copy />
      {t.formatMessage({ defaultMessage: "Copy text" })}
    </Button>
  );
  if (!blockedBy) {
    return (
      <>
        {button}
        <WarningsDialog
          open={confirming}
          onOpenChange={setConfirming}
          confirmLabel={t.formatMessage({ defaultMessage: "Copy anyway" })}
          onConfirm={() => copy(true)}
        />
      </>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button takes no hover: the span does. */}
        <span tabIndex={0}>{button}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{blockedBy}</TooltipContent>
    </Tooltip>
  );
}
