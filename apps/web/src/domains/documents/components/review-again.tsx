"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/web/components/ui/popover";
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
 * “Review again” (resume spec, “Review rounds”): one reviewer, or three in
 * parallel, and the coverage review judge the text as it is now, rewriting
 * nothing. The button opens the choice, each option with its credit cost.
 */
export function ReviewAgainButton({ version }: { version: VersionView }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshDocuments();
  const credits = useCredits();
  const [open, setOpen] = useState(false);
  const review = useMutation(
    trpc.documents.reviewAgain.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  const start = (reviewers: 1 | 3) => {
    setOpen(false);
    review.mutate({ versionId: version.id, reviewers });
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={review.isPending}
            className="gap-1"
          >
            {t.formatMessage({ defaultMessage: "Review again" })}
            <ChevronDown className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-64 flex-col gap-1 p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-auto justify-between gap-2 py-1.5"
            onClick={() => start(1)}
          >
            <span>{t.formatMessage({ defaultMessage: "1 reviewer" })}</span>
            <CreditCost credits={credits.data?.estimates.reReview} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto justify-between gap-2 py-1.5"
            onClick={() => start(3)}
          >
            <span>
              {t.formatMessage({ defaultMessage: "3 reviewers in parallel" })}
            </span>
            <CreditCost credits={credits.data?.estimates.reReviewParallel} />
          </Button>
        </PopoverContent>
      </Popover>
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
