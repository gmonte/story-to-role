"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import type { OutputLanguage } from "@repo/api/domains/documents/schemas/document";
import type { SimilarDocument } from "@repo/api/domains/documents/schemas/library";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import { useRefreshDocuments } from "../hooks/use-opening-documents";
import { GenerateResumeDialog } from "./generate-resume-dialog";

/**
 * Documents similar to the opening (resume spec, "Flow"), from the library
 * and other applications: used as they are (a copy starts this
 * application) or as a reference for a new generation.
 */
export function SimilarDocuments({
  openingId,
  defaultLanguage,
  defaultTone,
  pendingGaps,
}: {
  openingId: string;
  defaultLanguage: OutputLanguage;
  defaultTone: Tone;
  pendingGaps: number;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const similar = useQuery(
    trpc.library.similarForOpening.queryOptions({ openingId })
  );
  if (!similar.data?.length) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {t.formatMessage({ defaultMessage: "Similar documents" })}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {similar.data.map((document) => (
          <SimilarRow
            key={document.versionId}
            openingId={openingId}
            document={document}
            defaultLanguage={defaultLanguage}
            defaultTone={defaultTone}
            pendingGaps={pendingGaps}
          />
        ))}
      </ul>
    </section>
  );
}

function SimilarRow({
  openingId,
  document,
  defaultLanguage,
  defaultTone,
  pendingGaps,
}: {
  openingId: string;
  document: SimilarDocument;
  defaultLanguage: OutputLanguage;
  defaultTone: Tone;
  pendingGaps: number;
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const copy = useMutation(
    trpc.library.copyIntoApplication.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(
          other
            ? t.formatMessage({
                defaultMessage:
                  "Adapting it into this opening's resume as a new version.",
              })
            : t.formatMessage({
                defaultMessage:
                  "Copied into this opening's resume as a new version.",
              })
        );
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const { source } = document;
  // In another language than the output language it is adapted instead.
  const other = document.language !== defaultLanguage;

  return (
    <li className="bg-background flex flex-col gap-1.5 rounded-lg border p-2.5 text-xs">
      <span className="text-sm">
        {source.kind === "library"
          ? t.formatMessage(
              { defaultMessage: "Library · {focus}" },
              { focus: source.focus }
            )
          : t.formatMessage(
              { defaultMessage: "{company} · {title}" },
              {
                company: source.company ?? "",
                title: source.title ?? "",
              }
            )}
      </span>
      <span className="text-muted-foreground">{labels.version(document)}</span>
      {other && (
        <span className="text-muted-foreground">
          {t.formatMessage(
            {
              defaultMessage:
                "Using it as is adapts it into {language}, which counts as a generation.",
            },
            { language: labels.language(defaultLanguage) }
          )}
        </span>
      )}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="secondary"
          disabled={copy.isPending}
          onClick={() =>
            copy.mutate({
              openingId,
              versionId: document.versionId,
              language: defaultLanguage,
            })
          }
        >
          {other
            ? t.formatMessage({ defaultMessage: "Adapt and use" })
            : t.formatMessage({ defaultMessage: "Use as is" })}
        </Button>
        <GenerateResumeDialog
          openingId={openingId}
          defaultLanguage={defaultLanguage}
          defaultTone={defaultTone}
          pendingGaps={pendingGaps}
          referenceVersionId={document.versionId}
          trigger={
            <Button size="sm" variant="ghost">
              {t.formatMessage({ defaultMessage: "Use as reference" })}
            </Button>
          }
        />
      </div>
    </li>
  );
}
