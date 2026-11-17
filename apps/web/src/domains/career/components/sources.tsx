"use client";

import { useRef, useState, type DragEvent } from "react";

import { useMutation } from "@tanstack/react-query";
import { FileUp, Sparkles, Trash2 } from "lucide-react";

import { documentLimits } from "@repo/api/domains/career/documents/document-limits";
import type { Timeline } from "@repo/api/domains/career/schemas/timeline";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshCareer } from "../hooks/use-career-queries";
import {
  sourceAccept,
  sourceMegabytes,
  useSourceUpload,
} from "../hooks/use-source-upload";

const reading = (document: Timeline["documents"][number]) =>
  document.status === "pending" || document.status === "processing";

/**
 * The files that tell the user's career: resume versions, a LinkedIn PDF,
 * notes or a truth file, uploaded or dropped here. Each is stored for now;
 * P4 (docs/plan.md) re-adds reading them into the profile.
 */
export function Sources({
  documents,
  onPreview,
}: {
  documents: Timeline["documents"];
  onPreview?: (sourceDocumentId: string) => void;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const input = useRef<HTMLInputElement>(null);
  const { add } = useSourceUpload({ documents });
  const [dragging, setDragging] = useState(false);

  const remove = useMutation(
    trpc.career.removeDocument.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    add(Array.from(event.dataTransfer.files));
  }

  const reasonLabel = (reason: string | null) => {
    switch (reason) {
      case "not_a_career_document":
        return t.formatMessage({
          defaultMessage: "Doesn't look like a resume",
        });
      case "too_many_pages":
        return t.formatMessage({ defaultMessage: "Too many pages" });
      case "too_long":
        return t.formatMessage({ defaultMessage: "Too long" });
      case "too_short":
        return t.formatMessage({ defaultMessage: "Too short" });
      default:
        return t.formatMessage({ defaultMessage: "Couldn't be read" });
    }
  };

  const statusLabel = (document: Timeline["documents"][number]) => {
    switch (document.status) {
      case "stored":
        return t.formatMessage({ defaultMessage: "Saved" });
      case "pending":
      case "processing":
        return t.formatMessage({ defaultMessage: "Reading" });
      case "processed":
        return document.kind === "truth_file"
          ? t.formatMessage({ defaultMessage: "Truth file" })
          : t.formatMessage({ defaultMessage: "Imported" });
      case "rejected":
        return reasonLabel(document.rejectionReason);
      case "failed":
        return t.formatMessage({ defaultMessage: "Failed" });
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {t.formatMessage({ defaultMessage: "Sources" })}
      </h3>
      {/* What was uploaded comes first; the upload area below. */}
      <ul className="flex flex-col gap-1">
        {documents.map((document) => (
          <li key={document.id} className="flex items-center gap-1 text-xs">
            <button
              type="button"
              disabled={!onPreview}
              onClick={() => onPreview?.(document.id)}
              className="min-w-0 flex-1 truncate text-left enabled:hover:underline"
            >
              {document.fileName}
            </button>
            <Badge
              variant={
                document.status === "rejected" ? "destructive" : "outline"
              }
              className={reading(document) ? "gap-1" : undefined}
            >
              {/* Being read: the AI at work, not a still label. */}
              {reading(document) && (
                <Sparkles className="text-primary size-3 animate-pulse" />
              )}
              <span className={reading(document) ? "animate-pulse" : undefined}>
                {statusLabel(document)}
              </span>
            </Badge>
            {/* An import still reads its file. */}
            {!reading(document) && (
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={t.formatMessage({
                  defaultMessage: "Remove this source",
                })}
                disabled={remove.isPending}
                onClick={() => remove.mutate({ sourceDocumentId: document.id })}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center transition-colors",
          dragging && "border-primary bg-primary/5"
        )}
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() => input.current?.click()}
        >
          <FileUp />
          {t.formatMessage({ defaultMessage: "Upload files" })}
        </Button>
        <p className="text-muted-foreground text-xs">
          {t.formatMessage(
            {
              defaultMessage:
                "Or drop them here. Resumes, your LinkedIn PDF, notes about your career: up to {max, number} files. PDF, DOCX, Markdown or text, up to {megabytes, number} MB and {pages, number} pages each.",
            },
            {
              max: documentLimits.maxSources,
              megabytes: sourceMegabytes,
              pages: documentLimits.maxPages,
            }
          )}
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept={sourceAccept}
        multiple
        hidden
        onChange={(event) => {
          add(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </section>
  );
}
