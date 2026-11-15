"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";

import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/web/components/ui/dialog";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshDocuments } from "../hooks/use-opening-documents";

/**
 * Downloading the official snapshot as PDF (resume spec, "Download"): it
 * is rendered on demand, once per snapshot, under a suggested file name
 * the user can edit.
 */
export function DownloadPdfDialog({ version }: { version: VersionView }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const [fileName, setFileName] = useState(version.pdf.fileName);
  const request = useMutation(
    trpc.documents.requestPdf.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  const { ready, rendering } = version.pdf;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          setFileName(version.pdf.fileName);
          if (!ready && !rendering) request.mutate({ versionId: version.id });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Download />
          {t.formatMessage({ defaultMessage: "Download PDF" })}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.formatMessage({ defaultMessage: "Download PDF" })}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "The latest change of this version, in its layout. Accents and symbols are left out of the file name, since some portals break on them.",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="pdf-file-name">
            {t.formatMessage({ defaultMessage: "File name" })}
          </Label>
          <Input
            id="pdf-file-name"
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
          />
        </div>
        {ready && (
          <p className="text-muted-foreground text-xs">
            {t.formatMessage(
              {
                defaultMessage: "{pages, plural, one {# page} other {# pages}}",
              },
              { pages: version.pages }
            )}
          </p>
        )}
        <DialogFooter>
          {ready ? (
            <Button asChild>
              <a
                href={`/api/documents/versions/${version.id}/pdf?name=${encodeURIComponent(fileName)}`}
              >
                <Download />
                {t.formatMessage({ defaultMessage: "Download" })}
              </a>
            </Button>
          ) : rendering || request.isPending ? (
            <Button disabled>
              <Loader2 className="animate-spin" />
              {t.formatMessage({ defaultMessage: "Preparing the PDF…" })}
            </Button>
          ) : (
            // Neither ready nor rendering: the last render didn't finish.
            <Button onClick={() => request.mutate({ versionId: version.id })}>
              {t.formatMessage({ defaultMessage: "Try again" })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
