"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";

import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshDocuments } from "../hooks/use-opening-documents";
import { hasWarnings } from "../utils/version-checks";
import { WarningsDialog } from "./warnings-dialog";

/**
 * The application as one ZIP, shared by the button and the header's menu
 * item: the label to show, whether it is busy, `run` for the click, and the
 * confirmation `dialog` to render outside any menu. One click is enough:
 * the PDFs still missing are rendered first and the ZIP downloads once they
 * are ready. A ZIP with open findings asks for a confirmation (resume spec,
 * "Document workspace"); the server asks too.
 */
export function useDownloadZip(openingId: string, versions: VersionView[]) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const [confirming, setConfirming] = useState(false);
  // Set from the click until the ZIP is saved: whether the user confirmed
  // past open findings.
  const [wanted, setWanted] = useState<{ acknowledge: boolean } | null>(null);
  const downloading = useRef(false);
  const prepare = useMutation(
    trpc.documents.prepareApplicationZip.mutationOptions({
      onSuccess: refresh,
      onError: (error) => {
        setWanted(null);
        toast.error(error.message);
      },
    })
  );
  const ready = versions.every((version) => version.pdf.ready);
  const rendering = versions.some((version) => version.pdf.rendering);
  const warned = versions.some(hasWarnings);

  const start = (acknowledge: boolean) => {
    setWanted({ acknowledge });
    if (!ready) {
      prepare.mutate({
        openingId,
        acknowledgeWarnings: acknowledge || undefined,
      });
    }
  };

  const run = () => {
    if (warned) setConfirming(true);
    else start(false);
  };

  const refreshDocuments = useEffectEvent(refresh);
  const failed = useEffectEvent(() =>
    toast.error(
      t.formatMessage({ defaultMessage: "The ZIP couldn't be downloaded." })
    )
  );

  useEffect(() => {
    if (!wanted || !ready || prepare.isPending || downloading.current) return;
    downloading.current = true;
    void (async () => {
      const result = await saveZip(openingId, wanted.acknowledge);
      downloading.current = false;
      // A PDF gone from storage (a cache): the server renders it anew, and
      // the ZIP downloads once the refreshed versions are ready again.
      if (result === "missing") return refreshDocuments();
      setWanted(null);
      if (result === "failed") failed();
    })();
  }, [openingId, wanted, ready, prepare.isPending]);

  const dialog = (
    <WarningsDialog
      open={confirming}
      onOpenChange={setConfirming}
      confirmLabel={t.formatMessage({ defaultMessage: "Generate PDF anyway" })}
      onConfirm={() => start(true)}
    />
  );

  // Neither ready nor rendering: a render didn't finish, so the button is
  // offered again, and its click asks for the missing PDFs anew.
  const stalled = !ready && !rendering && !prepare.isPending;
  const busy = wanted !== null && !stalled;
  return {
    run,
    dialog,
    busy,
    label: !busy
      ? t.formatMessage({ defaultMessage: "Download all (ZIP)" })
      : ready
        ? t.formatMessage({ defaultMessage: "Building the ZIP…" })
        : t.formatMessage({ defaultMessage: "Preparing the PDFs…" }),
  };
}

/**
 * Fetches the application's ZIP and saves it under the name its response
 * suggests; "missing" while a PDF still has to be rendered (409).
 */
async function saveZip(openingId: string, acknowledge: boolean) {
  try {
    const response = await fetch(
      `/api/openings/${openingId}/documents-zip${acknowledge ? "?acknowledge=1" : ""}`
    );
    if (response.status === 409) return "missing";
    if (!response.ok) return "failed";
    const name = /filename="([^"]+)"/.exec(
      response.headers.get("Content-Disposition") ?? ""
    )?.[1];
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = name ?? "documents.zip";
    link.click();
    URL.revokeObjectURL(url);
    return "saved";
  } catch {
    return "failed";
  }
}

/** The application as one ZIP: every version's PDF, named after the opening. */
export function DownloadZipButton({
  openingId,
  versions,
  className,
}: {
  openingId: string;
  versions: VersionView[];
  className?: string;
}) {
  const zip = useDownloadZip(openingId, versions);
  return (
    <>
      {zip.dialog}
      <Button
        size="sm"
        variant="outline"
        className={cn("self-start", className)}
        disabled={zip.busy}
        onClick={zip.run}
      >
        {zip.busy ? <Loader2 className="animate-spin" /> : <Download />}
        {zip.label}
      </Button>
    </>
  );
}
