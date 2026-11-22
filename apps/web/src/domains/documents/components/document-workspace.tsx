"use client";

import { useState, type ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";
import {
  Check,
  ListTree,
  Pencil,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/web/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@repo/web/components/ui/tabs";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";
import { ResizableAside } from "~/domains/workspace/components/resizable-aside";
import { usePhone } from "~/domains/workspace/hooks/use-desktop";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useRefreshDocuments } from "../hooks/use-opening-documents";
import { CoverageScoreBadge } from "./coverage-score";
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
  aside,
  index,
}: {
  version: VersionView;
  versions: VersionView[];
  select: (versionId: string) => void;
  /** What the document wants said above it (a letter's outdated resume). */
  notices?: ReactNode;
  /** More for the left column: what applies to this document's opening. */
  aside?: ReactNode;
  /** The left column's index, when the document has its own (LinkedIn). */
  index?: ReactNode;
}) {
  const t = useTranslation();
  const phone = usePhone();
  // A phone reads the document first; Edit turns the keyboard on.
  const [editing, setEditing] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const left = (
    <>
      {index ?? <DocumentIndex />}
      <DocumentFindings />
      {aside}
    </>
  );
  return (
    <DocumentEditorProvider
      key={version.id}
      version={version}
      editable={!phone || editing}
    >
      <div className="flex min-h-0 flex-1">
        {!phone && (
          <ResizableAside
            storageKey="document-index-width"
            className="space-y-6 p-4"
          >
            {left}
          </ResizableAside>
        )}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <DocumentToolbar
            versions={versions}
            select={select}
            indexButton={
              phone && (
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={t.formatMessage({ defaultMessage: "Index" })}
                  onClick={() => setIndexOpen(true)}
                >
                  <ListTree />
                </Button>
              )
            }
          />
          <DocumentChangesBar />
          <div className="mx-auto flex w-full max-w-[52rem] flex-col gap-2 px-6 pt-4 empty:hidden">
            <NewerProfileNotice />
            {notices}
          </div>
          <DocumentEditor />
        </div>
        {phone && (
          <>
            <Button
              className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 h-12 rounded-full px-5 shadow-lg"
              onClick={() => setEditing((current) => !current)}
            >
              {editing ? <Check /> : <Pencil />}
              {editing
                ? t.formatMessage({ defaultMessage: "Done" })
                : t.formatMessage({ defaultMessage: "Edit" })}
            </Button>
            <Sheet open={indexOpen} onOpenChange={setIndexOpen}>
              <SheetContent className="w-[min(100vw,24rem)] gap-0 overflow-y-auto p-4 pt-12">
                <SheetHeader className="sr-only">
                  <SheetTitle>
                    {t.formatMessage({ defaultMessage: "Index" })}
                  </SheetTitle>
                  <SheetDescription>
                    {t.formatMessage({ defaultMessage: "Index" })}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-6">{left}</div>
              </SheetContent>
            </Sheet>
          </>
        )}
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
    <div className="border-warning-border bg-warning-soft flex items-center gap-3 rounded-lg border p-3 text-xs">
      <TriangleAlert className="text-warning size-4 shrink-0" />
      <span className="min-w-0 flex-1">
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
        className="shrink-0"
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

/** The versions' tabs, the origin legend, the save status and undo. */
function DocumentToolbar({
  versions,
  select,
  indexButton,
}: {
  versions: VersionView[];
  select: (versionId: string) => void;
  /** A phone's way to the index and the findings. */
  indexButton?: ReactNode;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const { version, saveStatus } = useDocumentEditor();
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
        {/* On a phone the index and the score share the first line, the
            legend goes under them. */}
        <div className="flex flex-wrap items-center gap-3 max-sm:contents">
          {indexButton}
          {/* One version needs no tabs: they'd be a button doing nothing. */}
          {versions.length > 1 && (
            <Tabs value={version.id} onValueChange={select}>
              <TabsList>
                {versions.map((row) => (
                  <TabsTrigger key={row.id} value={row.id}>
                    {labels.version(row)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          {/* On a phone the legend is one line that scrolls sideways. */}
          <div className="text-muted-foreground flex flex-wrap gap-3 text-xs max-sm:order-last max-sm:basis-full max-sm:[scrollbar-width:none] max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:[&::-webkit-scrollbar]:hidden max-sm:[&>*]:shrink-0">
            <Legend className="border-l-origin-profile">
              {t.formatMessage({ defaultMessage: "Your profile" })}
            </Legend>
            <Legend className="border-l-origin-edited border-dashed">
              {t.formatMessage({ defaultMessage: "Edited by you" })}
            </Legend>
            <Legend className="border-l-origin-instruction">
              {t.formatMessage({ defaultMessage: "Application instruction" })}
            </Legend>
            <Legend className="border-l-origin-written">
              {t.formatMessage({ defaultMessage: "Written by you" })}
            </Legend>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <CoverageScoreBadge version={version} />
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
            variant="ghost"
            disabled={
              version.snapshotCount < 2 ||
              undo.isPending ||
              saveStatus !== "saved"
            }
            onClick={() => undo.mutate({ versionId: version.id })}
          >
            <RotateCcw />
            <span className="max-sm:sr-only">
              {t.formatMessage({ defaultMessage: "Undo" })}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** One origin's rule, as the text shows it beside a line. */
function Legend({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-3.5 border-l-2", className)} />
      {children}
    </span>
  );
}
