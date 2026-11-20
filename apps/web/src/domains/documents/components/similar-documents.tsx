"use client";

import type { ReactNode, ComponentProps } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";

import type { OutputLanguage } from "@repo/api/domains/documents/schemas/document";
import type { SimilarDocument } from "@repo/api/domains/documents/schemas/library";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useDocumentLabels } from "../hooks/use-document-labels";
import {
  useOpeningDocuments,
  useRefreshDocuments,
} from "../hooks/use-opening-documents";
import { GenerateResumeDialog } from "./generate-resume-dialog";

/**
 * Documents similar to the opening (resume spec, "Flow"), from the library
 * and other applications, and the three ways to a resume: one of them used
 * as it is (a copy starts this application), adjusted for this opening, or
 * a new version generated from the published profile.
 */
export function SimilarDocuments({
  openingId,
  defaultLanguage,
  defaultTone,
  pendingGaps,
  separator,
}: {
  openingId: string;
  defaultLanguage: OutputLanguage;
  defaultTone: Tone;
  pendingGaps: number;
  // Shown above the list only when there are similar documents.
  separator?: ReactNode;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const similar = useQuery(
    trpc.library.similarForOpening.queryOptions({ openingId })
  );
  const documents = useOpeningDocuments(openingId);
  if (!similar.data?.length) return null;

  return (
    <>
      {separator}
      <section className="flex flex-col gap-2">
        <div>
          <h3 className="text-sm font-medium">
            {t.formatMessage({ defaultMessage: "Similar documents" })}
          </h3>
          <p className="text-muted-foreground text-xs">
            {t.formatMessage({
              defaultMessage:
                "Start from a resume you already have: use it as it is, or adjust it for this opening.",
            })}
          </p>
        </div>
        <ul className="flex flex-col gap-1.5">
          {similar.data.map((document) => (
            <SimilarRow
              key={document.versionId}
              openingId={openingId}
              document={document}
              defaultLanguage={defaultLanguage}
              defaultTone={defaultTone}
              pendingGaps={pendingGaps}
              application={documents.data?.application ?? null}
            />
          ))}
        </ul>
      </section>
    </>
  );
}

function SimilarRow({
  openingId,
  document,
  defaultLanguage,
  defaultTone,
  pendingGaps,
  application,
}: {
  openingId: string;
  document: SimilarDocument;
  defaultLanguage: OutputLanguage;
  defaultTone: Tone;
  pendingGaps: number;
  /** Its section choices, which an adjustment starts from. */
  application: ComponentProps<typeof GenerateResumeDialog>["application"];
}) {
  const t = useTranslation();
  const labels = useDocumentLabels();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const copy = useMutation(
    trpc.library.copyIntoApplication.mutationOptions({
      onSuccess: async (_result, input) => {
        await refresh();
        toast.success(
          input.language !== document.language
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
  // In another language than the opening's: used as is in its own
  // language, or translated into the opening's (a generation).
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
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="secondary"
          disabled={copy.isPending}
          onClick={() =>
            copy.mutate({
              openingId,
              versionId: document.versionId,
              language: document.language,
            })
          }
        >
          {t.formatMessage({ defaultMessage: "Use as is" })}
        </Button>
        {other && (
          <Button
            size="sm"
            variant="ghost"
            disabled={copy.isPending}
            title={t.formatMessage({
              defaultMessage: "Counts as a generation.",
            })}
            onClick={() =>
              copy.mutate({
                openingId,
                versionId: document.versionId,
                language: defaultLanguage,
              })
            }
          >
            {t.formatMessage(
              { defaultMessage: "Translate into {language}" },
              { language: labels.language(defaultLanguage) }
            )}
          </Button>
        )}
        <GenerateResumeDialog
          openingId={openingId}
          defaultLanguage={defaultLanguage}
          defaultTone={defaultTone}
          pendingGaps={pendingGaps}
          application={application}
          reference={document}
          trigger={
            <Button size="sm" variant="ghost">
              {t.formatMessage({ defaultMessage: "Adjust" })}
            </Button>
          }
        />
      </div>
    </li>
  );
}
