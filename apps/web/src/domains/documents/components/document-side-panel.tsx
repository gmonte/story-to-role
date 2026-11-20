"use client";

import { useEffect, useState, type ReactNode } from "react";

import { useMutation } from "@tanstack/react-query";
import {
  CopyPlus,
  Languages,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";

import type {
  DocumentView,
  VersionView,
} from "@repo/api/domains/documents/schemas/document-view";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/web/components/ui/tabs";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useDocumentAgent } from "./document-agent-context";
import { useRefreshDocuments } from "../hooks/use-opening-documents";
import { hasWarnings } from "../utils/version-checks";
import { AdaptVersionDialog } from "./adapt-version-dialog";
import { VersionChecks } from "./documents-panel";
import { DownloadPdfDialog } from "./download-pdf-dialog";
import { OutdatedNotice, SyncProposal } from "./language-sync";
import { VersionHistorySheet } from "./version-history-sheet";
import { WarningsDialog } from "./warnings-dialog";

/**
 * The right panel of the document workspace (resume spec, "Document
 * workspace"): the document's agent, the PDF preview of the selected
 * version's latest snapshot, and the versions with their change history
 * and actions. Asking to talk about a passage brings the agent forward.
 */
export function DocumentSidePanel({
  version,
  versions,
  agent,
  preview = true,
}: {
  version: VersionView;
  /** The Versions tab: the list, what creates versions, the checks. */
  versions: ReactNode;
  /** The Agent tab, first when given. */
  agent?: ReactNode;
  /** The PDF preview's tab; a LinkedIn text has no PDF. */
  preview?: boolean;
}) {
  const t = useTranslation();
  const [tab, setTab] = useState(
    agent ? "agent" : preview ? "preview" : "versions"
  );
  // A new topic (a passage, a finding) opens the agent, once per request.
  const topic = useDocumentAgent()?.topic;
  const [seenTopic, setSeenTopic] = useState(topic?.id);
  if (agent && topic && topic.id !== seenTopic) {
    setSeenTopic(topic.id);
    setTab("agent");
  }
  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className={cn("gap-3", tab === "agent" && "h-full min-h-0 flex-col")}
    >
      <TabsList className="w-full">
        {agent && (
          <TabsTrigger value="agent" className="flex-1">
            {t.formatMessage({ defaultMessage: "Agent" })}
          </TabsTrigger>
        )}
        {preview && (
          <TabsTrigger value="preview" className="flex-1">
            {t.formatMessage({ defaultMessage: "Preview" })}
          </TabsTrigger>
        )}
        <TabsTrigger value="versions" className="flex-1">
          {t.formatMessage({ defaultMessage: "Versions" })}
        </TabsTrigger>
      </TabsList>
      {agent && (
        // Kept mounted: the conversation survives a look at the preview.
        <TabsContent
          value="agent"
          forceMount
          className="bg-background -mx-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border data-[state=inactive]:hidden"
        >
          {agent}
        </TabsContent>
      )}
      {preview && (
        <TabsContent value="preview">
          <PdfPreview key={version.id} version={version} />
        </TabsContent>
      )}
      <TabsContent value="versions" className="flex flex-col gap-4">
        {versions}
      </TabsContent>
    </Tabs>
  );
}

const previewRenderDelayMs = 2500;

/**
 * The PDF of the latest snapshot, rendered on demand and shown in place;
 * it refreshes with every saved change. Open findings ask once for
 * "Generate PDF anyway".
 */
export function PdfPreview({ version }: { version: VersionView }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const request = useMutation(
    trpc.documents.requestPdf.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  const warned = hasWarnings(version) && !acknowledged;
  const { ready, rendering } = version.pdf;
  const snapshotId = version.snapshot.id;
  const canRender = !warned;
  const { mutate } = request;

  // A snapshot is rendered once the user pauses: typing makes a snapshot
  // every few seconds, and rendering each would flood the server.
  useEffect(() => {
    if (!canRender || ready || rendering) return;
    const timer = setTimeout(() => {
      mutate({
        versionId: version.id,
        acknowledgeWarnings: acknowledged || undefined,
      });
    }, previewRenderDelayMs);
    return () => clearTimeout(timer);
    // Once per snapshot: the view polls while it renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotId, canRender, ready, rendering]);

  if (warned) {
    return (
      <>
        <WarningsDialog
          open={confirming}
          onOpenChange={setConfirming}
          confirmLabel={t.formatMessage({
            defaultMessage: "Generate PDF anyway",
          })}
          onConfirm={() => setAcknowledged(true)}
        />
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
          <p>
            {t.formatMessage({
              defaultMessage:
                "The document has open findings beside it. You can generate the PDF anyway.",
            })}
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            onClick={() => setConfirming(true)}
          >
            {t.formatMessage({ defaultMessage: "Generate PDF anyway" })}
          </Button>
        </div>
      </>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {ready ? (
        <iframe
          key={snapshotId}
          title={t.formatMessage({ defaultMessage: "PDF preview" })}
          src={`/api/documents/versions/${version.id}/pdf?inline=1${acknowledged ? "&acknowledge=1" : ""}#toolbar=0&view=FitH`}
          className="bg-muted aspect-[1/1.414] w-full rounded-lg border"
        />
      ) : (
        <div className="bg-muted/40 text-muted-foreground flex aspect-[1/1.414] w-full flex-col items-center justify-center gap-2 rounded-lg border text-xs">
          <Loader2 className="size-4 animate-spin" />
          {t.formatMessage({ defaultMessage: "Rendering the PDF…" })}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {ready
            ? t.formatMessage(
                {
                  defaultMessage:
                    "{pages, plural, =0 {No pages} one {# page} other {# pages}}",
                },
                { pages: version.pages }
              )
            : null}
        </span>
        <DownloadPdfDialog key={version.id} version={version} />
      </div>
    </div>
  );
}

/**
 * The rows of a document's versions; the selected one is the editor's.
 */
export function VersionList({
  versions,
  version,
  select,
  label,
}: {
  versions: VersionView[];
  version: VersionView;
  select: (versionId: string) => void;
  /** The row's name: "Resume · English", "Cover letter · Portuguese". */
  label: (version: VersionView) => string;
}) {
  const t = useTranslation();
  return (
    <ul className="flex flex-col gap-1">
      {versions.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => select(row.id)}
            className={cn(
              "bg-background flex w-full items-center justify-between rounded-lg border p-2.5 text-left text-sm",
              version.id === row.id && "border-primary"
            )}
          >
            <span>{label(row)}</span>
            <span className="text-muted-foreground text-[11px]">
              {row.sent
                ? row.sent.snapshotId === row.snapshot.id
                  ? t.formatMessage({ defaultMessage: "Sent as it is" })
                  : t.formatMessage({ defaultMessage: "Sent; edited since" })
                : t.formatMessage(
                    {
                      defaultMessage:
                        "{count, plural, =0 {no changes} one {# change} other {# changes}}",
                    },
                    { count: row.snapshotCount }
                  )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * What can be done with the selected version: rename its tab, see its
 * change history, duplicate it, recreate it from another language,
 * generate it again or delete it. The PDF download sits in the preview.
 */
export function VersionActions({
  version,
  versions,
  generateAgain,
  onSelect,
}: {
  version: VersionView;
  versions: VersionView[];
  /** The screen's own "Generate again" dialog, around the given trigger. */
  generateAgain?: (version: VersionView, trigger: ReactNode) => ReactNode;
  onSelect: (versionId: string) => void;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const onError = (error: { message: string }) => toast.error(error.message);
  const duplicate = useMutation(
    trpc.documents.duplicate.mutationOptions({
      onSuccess: async ({ versionId }) => {
        await refresh();
        onSelect(versionId);
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

  return (
    <div className="flex flex-wrap items-center gap-1">
      <VersionHistorySheet versionId={version.id} />
      <RenameVersionDialog
        versionId={version.id}
        label={version.label}
        onRenamed={refresh}
      />
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
              {t.formatMessage({ defaultMessage: "Adapt from…" })}
            </Button>
          }
        />
      )}
      {generateAgain?.(
        version,
        <Button size="sm" variant="ghost">
          <Sparkles />
          {t.formatMessage({ defaultMessage: "Generate again" })}
        </Button>
      )}
      <Dialog>
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            title={t.formatMessage({ defaultMessage: "Delete version" })}
          >
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
  );
}

/**
 * The Versions tab of a document that has no Documents block of its own
 * (a library document, an application's cover letter): the list, the
 * actions of the selected version, the sync notices and its checks.
 */
export function VersionsBlock({
  document,
  version,
  select,
  label,
  newVersion,
  generateAgain,
  children,
}: {
  document: DocumentView;
  version: VersionView;
  select: (versionId: string) => void;
  label: (version: VersionView) => string;
  newVersion?: ReactNode;
  generateAgain?: (version: VersionView, trigger: ReactNode) => ReactNode;
  children?: ReactNode;
}) {
  const t = useTranslation();
  const { versions } = document;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {t.formatMessage({ defaultMessage: "Versions" })}
        </h3>
        {newVersion}
      </div>
      <VersionList
        versions={versions}
        version={version}
        select={select}
        label={label}
      />
      <VersionActions
        version={version}
        versions={versions}
        generateAgain={generateAgain}
        onSelect={select}
      />
      {children}
      <SyncProposal document={document} versions={versions} />
      <OutdatedNotice version={version} versions={versions} />
      <VersionChecks version={version} />
    </section>
  );
}

/** Renames the version's tab ("Portuguese · copy" becomes anything). */
export function RenameVersionDialog({
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
          {t.formatMessage({ defaultMessage: "Rename" })}
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

/** "Resume · English" / "Cover letter · Portuguese", for a version row. */
export function useVersionRowLabel() {
  const t = useTranslation();
  const labels = useDocumentLabels();
  return (kind: DocumentView["kind"]) => (version: VersionView) =>
    kind === "cover_letter"
      ? t.formatMessage(
          { defaultMessage: "Cover letter · {version}" },
          { version: labels.version(version) }
        )
      : kind === "linkedin"
        ? t.formatMessage(
            { defaultMessage: "LinkedIn · {version}" },
            { version: labels.version(version) }
          )
        : t.formatMessage(
            { defaultMessage: "Resume · {version}" },
            { version: labels.version(version) }
          );
}
