"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";

import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshDocuments } from "../hooks/use-opening-documents";

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

  return ready ? (
    <Button size="sm" variant="outline" className="self-start" asChild>
      <a href={`/api/openings/${openingId}/documents-zip`}>
        <Download />
        {t.formatMessage({ defaultMessage: "Download all (ZIP)" })}
      </a>
    </Button>
  ) : (
    <Button
      size="sm"
      variant="outline"
      className="self-start"
      disabled={prepare.isPending || rendering}
      onClick={() => prepare.mutate({ openingId })}
    >
      {rendering ? <Loader2 className="animate-spin" /> : <Download />}
      {rendering
        ? t.formatMessage({ defaultMessage: "Preparing the PDFs…" })
        : t.formatMessage({ defaultMessage: "Prepare all as ZIP" })}
    </Button>
  );
}
