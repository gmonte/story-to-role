"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { useTRPC } from "~/tools/trpc/client";

import { useTimeline } from "../hooks/use-career-queries";
import { useCareerWorkspace } from "./career-workspace-context";

/**
 * A source's read-only preview beside the side panel, as the Claude app
 * opens a file. It never loads the file itself: a PDF arrives as page images
 * rendered on the server and anything else as plain text, which React
 * escapes, so no script in a file can run.
 */
export function SourcePreview() {
  const t = useTranslation();
  const trpc = useTRPC();
  const timeline = useTimeline();
  const { previewSourceDocumentId, setPreviewSourceDocumentId } =
    useCareerWorkspace();
  const preview = useQuery({
    ...trpc.career.documentPreview.queryOptions({
      sourceDocumentId: previewSourceDocumentId ?? "",
    }),
    enabled: !!previewSourceDocumentId,
  });

  const document = timeline.data?.documents.find(
    (candidate) => candidate.id === previewSourceDocumentId
  );
  // A source removed while open closes its preview.
  if (!previewSourceDocumentId || !document) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <p className="truncate text-sm font-medium">{document.fileName}</p>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={t.formatMessage({ defaultMessage: "Close the preview" })}
          onClick={() => setPreviewSourceDocumentId(null)}
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!preview.data && (
          <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />
        )}
        {preview.data?.type === "text" && (
          <pre className="font-sans text-xs leading-relaxed whitespace-pre-wrap">
            {preview.data.text}
          </pre>
        )}
        {preview.data?.type === "pdf" && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: preview.data.pageCount }, (_, i) => (
              // Server-rendered page images, private to the user.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={`/api/career/documents/${previewSourceDocumentId}/pages/${i + 1}`}
                alt={t.formatMessage(
                  { defaultMessage: "Page {page, number}" },
                  { page: i + 1 }
                )}
                loading="lazy"
                className="w-full rounded border bg-white"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
