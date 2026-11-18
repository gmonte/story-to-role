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
import { hasFindings, hasWarnings } from "../utils/version-checks";
import { WarningsDialog } from "./warnings-dialog";

/** The application as one ZIP: every version's PDF, named after the opening. */
export function DownloadZipButton({
  openingId,
  versions,
}: {
  openingId: string;
  versions: VersionView[];
}) {
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
  // One document with coverage findings holds the whole ZIP (resume spec,
  // "Coverage review"); the server refuses it too.
  const blocked = versions.some(hasFindings);
  const warned = versions.some(hasWarnings);
  const [confirming, setConfirming] = useState<"download" | "prepare" | null>(
    null
  );
  const blockedTitle = t.formatMessage({
    defaultMessage: "Fix the coverage findings before downloading.",
  });

  const confirmDialog = (
    <WarningsDialog
      open={confirming !== null}
      onOpenChange={(open) => !open && setConfirming(null)}
      confirmLabel={t.formatMessage({ defaultMessage: "Generate PDF anyway" })}
      onConfirm={() => {
        if (confirming === "download") {
          window.location.assign(
            `/api/openings/${openingId}/documents-zip?acknowledge=1`
          );
        } else {
          prepare.mutate({ openingId, acknowledgeWarnings: true });
        }
      }}
    />
  );

  return blocked ? (
    <Button
      size="sm"
      variant="outline"
      className="self-start"
      disabled
      title={blockedTitle}
    >
      <Download />
      {t.formatMessage({ defaultMessage: "Download all (ZIP)" })}
    </Button>
  ) : ready && warned ? (
    <>
      {confirmDialog}
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => setConfirming("download")}
      >
        <Download />
        {t.formatMessage({ defaultMessage: "Download all (ZIP)" })}
      </Button>
    </>
  ) : ready ? (
    <Button size="sm" variant="outline" className="self-start" asChild>
      <a href={`/api/openings/${openingId}/documents-zip`}>
        <Download />
        {t.formatMessage({ defaultMessage: "Download all (ZIP)" })}
      </a>
    </Button>
  ) : (
    <>
      {confirmDialog}
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={prepare.isPending || rendering}
        onClick={() =>
          warned ? setConfirming("prepare") : prepare.mutate({ openingId })
        }
      >
        {rendering ? <Loader2 className="animate-spin" /> : <Download />}
        {rendering
          ? t.formatMessage({ defaultMessage: "Preparing the PDFs…" })
          : t.formatMessage({ defaultMessage: "Prepare all as ZIP" })}
      </Button>
    </>
  );
}
