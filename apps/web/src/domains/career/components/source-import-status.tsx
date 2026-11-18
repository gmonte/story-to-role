"use client";

import { useMutation } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";

import type { Timeline } from "@repo/api/domains/career/schemas/timeline";
import type { SourceImportRejection } from "@repo/api/domains/career/schemas/career";
import { documentLimits } from "@repo/api/domains/career/documents/document-limits";
import { importSteps } from "@repo/api/domains/profile/import/import-settings";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { AiAtWork } from "~/domains/workspace/components/ai-at-work";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshCareer } from "../hooks/use-career-queries";

type SourceDocument = Timeline["documents"][number];

/**
 * Where a source's import stands (profile spec, "Importing a resume"): the
 * AI at work on it step by step, why it was refused, or the button that
 * starts it (again) with its cost.
 */
export function SourceImportStatus({ document }: { document: SourceDocument }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const credits = useCredits();
  const start = useMutation(
    trpc.career.importDocument.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );

  const stepLabels: Record<(typeof importSteps)[number], string> = {
    reading: t.formatMessage({ defaultMessage: "Turning the file into text" }),
    checking: t.formatMessage({
      defaultMessage: "Checking that it is about your career",
    }),
    comparing: t.formatMessage({
      defaultMessage: "Comparing it with your profile, line by line",
    }),
    suggesting: t.formatMessage({
      defaultMessage: "Writing suggestions for what the profile lacks",
    }),
  };

  if (document.importStatus === "importing") {
    return (
      <AiAtWork
        className="mt-1"
        title={t.formatMessage(
          { defaultMessage: "Reading {fileName}" },
          { fileName: document.fileName }
        )}
        current={document.importProgress?.label ?? "reading"}
        steps={importSteps.map((key) => ({ key, label: stepLabels[key] }))}
        detail={
          document.importProgress?.label === "comparing" &&
          (document.importProgress.counts?.parts ?? 0) > 1
            ? t.formatMessage(
                { defaultMessage: "Part {part} of {parts} of the file." },
                {
                  part: document.importProgress.counts?.part ?? 1,
                  parts: document.importProgress.counts?.parts ?? 1,
                }
              )
            : document.importProgress?.counts?.found !== undefined &&
              t.formatMessage(
                {
                  defaultMessage:
                    "{count, plural, =0 {Nothing new found} one {# thing the profile may lack} other {# things the profile may lack}}.",
                },
                { count: document.importProgress.counts.found }
              )
        }
        note={t.formatMessage({
          defaultMessage: "You can keep editing; this continues by itself.",
        })}
      />
    );
  }

  const rejections: Record<SourceImportRejection, string> = {
    not_a_career_document: t.formatMessage({
      defaultMessage:
        "This doesn't look like a resume or notes about your career, so it wasn't imported.",
    }),
    too_many_pages: t.formatMessage(
      {
        defaultMessage:
          "It has more than {pages, number} pages, so it wasn't imported.",
      },
      { pages: documentLimits.maxPages }
    ),
    too_long: t.formatMessage({
      defaultMessage: "It is too long to import. Split it into smaller files.",
    }),
    too_short: t.formatMessage({
      defaultMessage: "There is too little text in it to import.",
    }),
    unreadable: t.formatMessage({
      defaultMessage:
        "Its text couldn't be read (a scanned PDF has none). Try another file.",
    }),
  };

  if (document.importStatus === "imported") {
    return (
      <p className="text-muted-foreground text-xs">
        {t.formatMessage({
          defaultMessage:
            "Read: what it added waits in your profile as suggestions.",
        })}
      </p>
    );
  }
  if (document.importStatus === "rejected" && document.importRejection) {
    return (
      <p className="text-xs text-amber-600">
        {rejections[document.importRejection]}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {document.importStatus === "failed" && (
        <span className="text-destructive text-xs">
          {t.formatMessage({
            defaultMessage: "The import didn't finish; nothing was charged.",
          })}
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-xs"
        disabled={start.isPending}
        onClick={() => start.mutate({ sourceDocumentId: document.id })}
      >
        <RotateCw className="size-3" />
        {t.formatMessage({ defaultMessage: "Import into the profile" })}
      </Button>
      <CreditCost credits={credits.data?.estimates.sourceImport} />
    </div>
  );
}
