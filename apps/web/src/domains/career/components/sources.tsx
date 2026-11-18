"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, Trash2 } from "lucide-react";

import { documentLimits } from "@repo/api/domains/career/documents/document-limits";
import type { Timeline } from "@repo/api/domains/career/schemas/timeline";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { cn } from "@repo/web/lib/utils";

import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshCareer } from "../hooks/use-career-queries";
import { SourceImportStatus } from "./source-import-status";
import {
  sourceAccept,
  sourceMegabytes,
  useSourceUpload,
} from "../hooks/use-source-upload";

/**
 * The files that tell the user's career: resume versions, a LinkedIn PDF,
 * notes or a truth file, uploaded or dropped here. Each is read into
 * suggestions for the profile (profile spec, "Importing a resume").
 */
export function Sources({
  documents,
  onPreview,
  beforeUpload,
}: {
  documents: Timeline["documents"];
  onPreview?: (sourceDocumentId: string) => void;
  // In the editor: saves the draft first, so an import compares with it.
  beforeUpload?: () => Promise<unknown>;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const input = useRef<HTMLInputElement>(null);
  const { add } = useSourceUpload({ documents, beforeUpload });
  const queryClient = useQueryClient();
  const credits = useCredits();

  // An import that just ended left suggestions in the profile (and spent
  // credits): what shows them catches up.
  const imported = documents.filter(
    (document) => document.importStatus === "imported"
  ).length;
  useEffect(() => {
    void queryClient.invalidateQueries({
      queryKey: trpc.profile.suggestions.queryKey({}),
    });
    void queryClient.invalidateQueries({ queryKey: trpc.credits.pathKey() });
  }, [imported, queryClient, trpc]);
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

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {t.formatMessage({ defaultMessage: "Sources" })}
      </h3>
      {/* What was uploaded comes first; the upload area below. */}
      <ul className="flex flex-col gap-1">
        {documents.map((document) => (
          <li key={document.id} className="flex flex-col gap-1 text-xs">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!onPreview}
                onClick={() => onPreview?.(document.id)}
                className="min-w-0 flex-1 truncate text-left enabled:hover:underline"
              >
                {document.fileName}
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={t.formatMessage({
                  defaultMessage: "Remove this source",
                })}
                disabled={
                  remove.isPending || document.importStatus === "importing"
                }
                onClick={() => remove.mutate({ sourceDocumentId: document.id })}
              >
                <Trash2 />
              </Button>
            </div>
            <SourceImportStatus document={document} />
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
        <div className="text-muted-foreground flex flex-col items-center gap-1 text-xs">
          <span>
            {t.formatMessage({
              defaultMessage:
                "Each file is read into suggestions for your profile.",
            })}
          </span>
          <CreditCost credits={credits.data?.estimates.sourceImport} />
        </div>
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
