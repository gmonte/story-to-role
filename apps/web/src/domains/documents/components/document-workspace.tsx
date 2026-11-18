"use client";

import type { ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";
import { Highlighter, RotateCcw } from "lucide-react";
import Link from "next/link";

import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@repo/web/components/ui/tabs";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useRefreshDocuments } from "../hooks/use-opening-documents";
import { DocumentChangesBar } from "./document-changes-bar";
import { DocumentEditor } from "./document-editor";
import {
  DocumentEditorProvider,
  useDocumentEditor,
} from "./document-editor-context";
import { DocumentFindings } from "./document-findings";
import { DocumentIndex } from "./document-index";

/**
 * The document workspace (resume spec, "Document workspace"): the index
 * and the findings on the left, the selected version's latest snapshot in
 * its PDF look in the middle; the page puts the preview and the versions
 * on the right. Another version is another editor.
 */
export function DocumentWorkspace({
  version,
  versions,
  select,
  notices,
}: {
  version: VersionView;
  versions: VersionView[];
  select: (versionId: string) => void;
  /** What the document wants said above it (a letter's outdated resume). */
  notices?: ReactNode;
}) {
  return (
    <DocumentEditorProvider key={version.id} version={version}>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 space-y-6 overflow-y-auto border-r p-4 md:block">
          <DocumentIndex />
          <DocumentFindings />
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <DocumentToolbar versions={versions} select={select} />
          <DocumentChangesBar />
          <div className="mx-auto flex w-full max-w-[52rem] flex-col gap-2 px-6 pt-4 empty:hidden">
            <NewerProfileNotice />
            {notices}
          </div>
          <DocumentEditor />
        </div>
      </div>
    </DocumentEditorProvider>
  );
}

/**
 * "Profile version N is newer than this document's" (resume spec,
 * "Document workspace"): Use version N moves the version to it, tracing
 * its lines again; no model is called.
 */
function NewerProfileNotice() {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const { version, saveStatus } = useDocumentEditor();
  const use = useMutation(
    trpc.documents.useProfileVersion.mutationOptions({
      onSuccess: async ({ profileVersionNumber }) => {
        await refresh();
        toast.success(
          t.formatMessage(
            {
              defaultMessage:
                "The document now reads profile version {number}: its traces and checks were run again.",
            },
            { number: profileVersionNumber }
          )
        );
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const newer = version.profile.newer;
  if (!newer) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
      <span>
        {t.formatMessage(
          {
            defaultMessage:
              "Profile version {number} is newer than this document's{current, select, none {} other { (version {current})}}.",
          },
          {
            number: newer.number,
            current: version.profile.versionNumber ?? "none",
          }
        )}
        <Link href="/app/career" className="ml-1 underline underline-offset-2">
          {t.formatMessage({ defaultMessage: "Open My career" })}
        </Link>
      </span>
      <Button
        size="sm"
        disabled={use.isPending || saveStatus !== "saved"}
        onClick={() => use.mutate({ versionId: version.id })}
      >
        {t.formatMessage(
          { defaultMessage: "Use version {number}" },
          { number: newer.number }
        )}
      </Button>
    </div>
  );
}

/** The versions' tabs, the save status, trace mode and undo. */
function DocumentToolbar({
  versions,
  select,
}: {
  versions: VersionView[];
  select: (versionId: string) => void;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const { version, saveStatus, trace, setTrace } = useDocumentEditor();
  const undo = useMutation(
    trpc.documents.undo.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  const status = {
    saved: t.formatMessage({ defaultMessage: "Saved" }),
    pending: t.formatMessage({ defaultMessage: "Editing…" }),
    saving: t.formatMessage({ defaultMessage: "Saving…" }),
    error: t.formatMessage({
      defaultMessage: "Not saved: check your connection",
    }),
  }[saveStatus];

  return (
    <div className="bg-background/95 sticky top-0 z-10 flex flex-col gap-2 border-b px-4 py-2 backdrop-blur">
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
          <span
            className={cn(
              "px-2 text-xs",
              saveStatus === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            )}
            aria-live="polite"
          >
            {status}
          </span>
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
            disabled={
              version.snapshotCount < 2 ||
              undo.isPending ||
              saveStatus !== "saved"
            }
            onClick={() => undo.mutate({ versionId: version.id })}
          >
            <RotateCcw />
            {t.formatMessage({ defaultMessage: "Undo" })}
          </Button>
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
    </div>
  );
}

function Legend({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", className)} />
      {children}
    </span>
  );
}
