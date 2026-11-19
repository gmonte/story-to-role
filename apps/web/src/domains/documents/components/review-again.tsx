"use client";

import { useMutation } from "@tanstack/react-query";

import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { CreditCost } from "~/domains/credits/components/credit-cost";
import { useCredits } from "~/domains/credits/hooks/use-credits";
import { AiAtWork } from "~/domains/workspace/components/ai-at-work";
import { useTRPC } from "~/tools/trpc/client";

import { useRefreshDocuments } from "../hooks/use-opening-documents";

/** The notice that a review judged the text before the user edited it. */
export function StaleReviewNotice() {
  const t = useTranslation();
  return (
    <p className="text-muted-foreground text-xs">
      {t.formatMessage({
        defaultMessage:
          "Review of the generated resume. You edited it afterwards.",
      })}
    </p>
  );
}

/**
 * “Review again” (resume spec, “Review rounds”): one reviewer and the
 * coverage review judge the text as it is now, rewriting nothing.
 */
export function ReviewAgainButton({ version }: { version: VersionView }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const credits = useCredits();
  const review = useMutation(
    trpc.documents.reviewAgain.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <CreditCost credits={credits.data?.estimates.reReview} />
      <Button
        size="sm"
        variant="outline"
        className="ml-auto"
        disabled={review.isPending}
        onClick={() => review.mutate({ versionId: version.id })}
      >
        {t.formatMessage({ defaultMessage: "Review again" })}
      </Button>
    </div>
  );
}

/** The re-review at work: its steps, live. */
export function ReviewProgress({
  progress,
}: {
  progress: NonNullable<VersionView["reviewing"]>["progress"];
}) {
  const t = useTranslation();
  return (
    <AiAtWork
      title={t.formatMessage({
        defaultMessage: "Reviewing the resume as it is now",
      })}
      current={progress?.label ?? "reviewing"}
      steps={[
        {
          key: "reviewing",
          label: t.formatMessage({
            defaultMessage: "A reviewer judges how well it covers the purpose",
          }),
        },
        {
          key: "coverage_review",
          label: t.formatMessage({
            defaultMessage: "Reviewing coverage against your profile",
          }),
        },
        {
          key: "saving",
          label: t.formatMessage({ defaultMessage: "Saving the review" }),
        },
      ]}
    />
  );
}
