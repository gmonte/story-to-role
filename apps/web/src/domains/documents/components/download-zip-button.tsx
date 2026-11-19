"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";

import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshDocuments } from "../hooks/use-opening-documents";
import { hasWarnings } from "../utils/version-checks";
import { WarningsDialog } from "./warnings-dialog";

/**
 * The application as one ZIP, shared by the button and the header's menu
 * item: the label to show, whether it is busy, `run` for the click, and the
 * confirmation `dialog` to render outside any menu. A ZIP with open
 * findings asks for a confirmation (resume spec, "Document workspace");
 * the server asks too.
 */
export function useDownloadZip(openingId: string, versions: VersionView[]) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const prepare = useMutation(
    trpc.documents.prepareApplicationZip.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  const ready = versions.every((version) => version.pdf.ready);
  const rendering = versions.some((version) => version.pdf.rendering);
  const warned = versions.some(hasWarnings);
  const [confirming, setConfirming] = useState<"download" | "prepare" | null>(
    null
  );
  const zipUrl = `/api/openings/${openingId}/documents-zip`;

  const run = () => {
    if (ready) {
      if (warned) setConfirming("download");
      else window.location.assign(zipUrl);
    } else if (warned) setConfirming("prepare");
    else prepare.mutate({ openingId });
  };

  const dialog = (
    <WarningsDialog
      open={confirming !== null}
      onOpenChange={(open) => !open && setConfirming(null)}
      confirmLabel={t.formatMessage({ defaultMessage: "Generate PDF anyway" })}
      onConfirm={() => {
        if (confirming === "download") {
          window.location.assign(`${zipUrl}?acknowledge=1`);
        } else {
          prepare.mutate({ openingId, acknowledgeWarnings: true });
        }
      }}
    />
  );

  return {
    run,
    dialog,
    busy: !ready && (prepare.isPending || rendering),
    rendering: !ready && rendering,
    label: ready
      ? t.formatMessage({ defaultMessage: "Download all (ZIP)" })
      : rendering
        ? t.formatMessage({ defaultMessage: "Preparing the PDFs…" })
        : t.formatMessage({ defaultMessage: "Prepare all as ZIP" }),
  };
}

/** The application as one ZIP: every version's PDF, named after the opening. */
export function DownloadZipButton({
  openingId,
  versions,
}: {
  openingId: string;
  versions: VersionView[];
}) {
  const zip = useDownloadZip(openingId, versions);
  return (
    <>
      {zip.dialog}
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={zip.busy}
        onClick={zip.run}
      >
        {zip.rendering ? <Loader2 className="animate-spin" /> : <Download />}
        {zip.label}
      </Button>
    </>
  );
}
