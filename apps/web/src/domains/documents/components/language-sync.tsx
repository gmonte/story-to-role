"use client";

import { useState } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import type {
  DocumentView,
  VersionView,
} from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/web/components/ui/dialog";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useRefreshDocuments } from "../hooks/use-opening-documents";
import { AdaptVersionDialog } from "./adapt-version-dialog";

/**
 * "Outdated relative to Portuguese: 3 changes" (resume spec, "Language
 * sync"), with the sync that carries those changes in, or recreating when
 * no common ancestor is left.
 */
export function OutdatedNotice({
  version,
  versions,
}: {
  version: VersionView;
  versions: VersionView[];
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();

  return version.outdated.map((outdated) => {
    const from = versions.find((row) => row.id === outdated.versionId);
    if (!from) return null;
    return (
      <div
        key={outdated.versionId}
        className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs"
      >
        <span>
          {t.formatMessage(
            {
              defaultMessage:
                "Outdated relative to {version}: {changes, plural, one {# change} other {# changes}}",
            },
            { version: labels.version(from), changes: outdated.changes }
          )}
        </span>
        {outdated.baseMissing ? (
          <AdaptVersionDialog
            key={version.id}
            versions={versions}
            target={version}
            trigger={
              <Button size="sm" variant="secondary">
                {t.formatMessage({ defaultMessage: "Recreate" })}
              </Button>
            }
          />
        ) : (
          <SyncDialog version={version} from={from} />
        )}
      </div>
    );
  });
}

/** The changes listed one by one, all selected; conflicts show both sides. */
function SyncDialog({
  version,
  from,
}: {
  version: VersionView;
  from: VersionView;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const [open, setOpen] = useState(false);
  const [unselected, setUnselected] = useState<string[]>([]);
  const preview = useQuery({
    ...trpc.adaptation.syncPreview.queryOptions({
      versionId: version.id,
      fromVersionId: from.id,
    }),
    enabled: open,
  });
  const start = useMutation(
    trpc.adaptation.startSync.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setOpen(false);
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const changes = preview.data?.changes ?? [];
  const selected = changes
    .map((change) => change.lineId)
    .filter((lineId) => !unselected.includes(lineId));
  const toggle = (lineId: string, on: boolean) =>
    setUnselected(
      on ? unselected.filter((id) => id !== lineId) : [...unselected, lineId]
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <RefreshCw />
          {t.formatMessage({ defaultMessage: "Sync" })}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t.formatMessage(
              { defaultMessage: "Bring changes from {version}" },
              { version: labels.version(from) }
            )}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "Your own edits in this version are kept. You review the result before it becomes a change.",
            })}
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {changes.map((change) => (
            <li
              key={change.lineId}
              className="grid gap-1 rounded-md border p-2 text-xs"
            >
              <label className="flex items-start gap-2">
                <Checkbox
                  className="mt-0.5"
                  checked={selected.includes(change.lineId)}
                  onCheckedChange={(checked) =>
                    toggle(change.lineId, !!checked)
                  }
                />
                <span className="grid gap-0.5">
                  <span className="font-medium">
                    {change.kind === "added"
                      ? t.formatMessage({ defaultMessage: "Added" })
                      : change.kind === "removed"
                        ? t.formatMessage({ defaultMessage: "Removed" })
                        : t.formatMessage({ defaultMessage: "Changed" })}
                  </span>
                  {change.after && <span>{change.after}</span>}
                  {change.kind === "removed" && change.before && (
                    <span className="line-through opacity-70">
                      {change.before}
                    </span>
                  )}
                </span>
              </label>
              {change.conflict && (
                <p className="rounded bg-amber-500/10 p-1.5">
                  {t.formatMessage(
                    {
                      defaultMessage:
                        "You also changed this line here: “{text}”. Checked, the change above replaces it; unchecked, yours stays.",
                    },
                    { text: change.targetText ?? "" }
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
        {preview.data && changes.length === 0 && (
          <p className="text-muted-foreground text-xs">
            {t.formatMessage({ defaultMessage: "Nothing left to bring." })}
          </p>
        )}
        <DialogFooter>
          <Button
            disabled={start.isPending || selected.length === 0}
            onClick={() =>
              start.mutate({
                versionId: version.id,
                fromVersionId: from.id,
                lineIds: selected,
              })
            }
          >
            {t.formatMessage({ defaultMessage: "Sync" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A finished sync waiting for the user: the diff, accept or discard. */
export function SyncProposal({
  document,
  versions,
}: {
  document: DocumentView;
  versions: VersionView[];
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const onError = (error: {
    data?: { code?: string } | null;
    message: string;
  }) =>
    toast.error(
      error.data?.code === "CONFLICT"
        ? t.formatMessage({
            defaultMessage:
              "This version changed after the proposal was made. Sync again.",
          })
        : error.message
    );
  const accept = useMutation(
    trpc.adaptation.acceptSync.mutationOptions({ onSuccess: refresh, onError })
  );
  const discard = useMutation(
    trpc.adaptation.discardSync.mutationOptions({ onSuccess: refresh, onError })
  );
  const generation = document.generation;
  if (generation?.kind !== "sync" || !generation.proposal) return null;
  const target = versions.find((row) => row.id === generation.versionId);
  const busy = accept.isPending || discard.isPending;

  return (
    <div className="bg-background flex flex-col gap-2 rounded-lg border border-sky-500/40 p-2.5 text-xs">
      <p className="text-sm font-medium">
        {t.formatMessage(
          { defaultMessage: "Sync proposal for {version}" },
          { version: target ? labels.version(target) : "" }
        )}
      </p>
      <ul className="grid gap-1.5">
        {generation.proposal.map((row) => (
          <li key={row.lineId} className="grid gap-0.5">
            {row.before && (
              <span className="line-through opacity-60">{row.before}</span>
            )}
            {row.after && <span>{row.after}</span>}
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => discard.mutate({ generationId: generation.id })}
        >
          {t.formatMessage({ defaultMessage: "Discard" })}
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => accept.mutate({ generationId: generation.id })}
        >
          {t.formatMessage({ defaultMessage: "Accept" })}
        </Button>
      </div>
    </div>
  );
}
