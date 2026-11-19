"use client";

import { useState } from "react";

import { ChevronDown } from "lucide-react";

import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/web/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/web/components/ui/popover";
import { cn } from "@repo/web/lib/utils";

import { coverageScoreBand, roundsTrail } from "../utils/coverage-score";
import {
  ReviewAgainButton,
  ReviewProgress,
  StaleReviewNotice,
} from "./review-again";

const badgeVariant = {
  good: "default",
  middling: "secondary",
  low: "destructive",
  capped: "destructive",
} as const;

type Review = NonNullable<VersionView["review"]>;

/** “Match score 8/10”. */
function useScoreLabel() {
  const t = useTranslation();
  return (review: Review) =>
    t.formatMessage(
      { defaultMessage: "Match score {rating}/10" },
      { rating: t.formatNumber(review.rating) }
    );
}

/** The band in a word: Strong, Fair, Low or Capped. */
function BandBadge({ band }: { band: keyof typeof badgeVariant }) {
  const t = useTranslation();
  return (
    <Badge variant={badgeVariant[band]}>
      {t.formatMessage(
        {
          defaultMessage:
            "{band, select, good {Strong} middling {Fair} capped {Capped} other {Low}}",
        },
        { band }
      )}
    </Badge>
  );
}

/**
 * The rating the resume earned in its review rounds, in plain words
 * (resume spec, "Review rounds"): how much of what the purpose asks, among
 * what the profile backs, the resume covers. Never a percentage; the
 * explanation opens under it.
 */
export function CoverageScore({ version }: { version: VersionView }) {
  const [open, setOpen] = useState(false);
  const label = useScoreLabel();
  const review = version.review;
  if (!review) return null;
  if (version.reviewing) {
    return <ReviewProgress progress={version.reviewing.progress} />;
  }

  return (
    <div className="bg-background flex flex-col gap-2 rounded-lg border p-2.5 text-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-medium">{label(review)}</span>
        <span className="flex items-center gap-1.5">
          <BandBadge band={coverageScoreBand(review)} />
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              open && "rotate-180"
            )}
          />
        </span>
      </button>
      <CoverageScoreBody version={version} showExplanation={open} />
    </div>
  );
}

/**
 * What sits under the score: the edited-after notice with “Review again”,
 * and the explanation. The card and the toolbar's popover share it.
 */
function CoverageScoreBody({
  version,
  showExplanation,
}: {
  version: VersionView;
  showExplanation: boolean;
}) {
  const t = useTranslation();
  const review = version.review;
  if (!review) return null;
  const band = coverageScoreBand(review);
  const purpose = review.purpose;

  return (
    <>
      {!review.current && (
        <div className="flex flex-col gap-2">
          <StaleReviewNotice />
          <ReviewAgainButton version={version} />
        </div>
      )}

      {showExplanation && (
        <div className="text-muted-foreground flex flex-col gap-1.5">
          <p>
            {t.formatMessage(
              {
                defaultMessage:
                  "The score StoryToRole’s reviewers gave this resume’s match with the {purpose, select, focus {focus} other {opening}}.",
              },
              { purpose }
            )}
          </p>
          <p>
            {review.ofEdit
              ? t.formatMessage(
                  {
                    defaultMessage:
                      "Review of the current text: {count, plural, =0 {no reviewers} one {# reviewer} other {# reviewers}}.",
                  },
                  { count: review.rounds.length }
                )
              : review.rounds.length > 1
                ? t.formatMessage(
                    {
                      defaultMessage:
                        "{count} reviewers ({trail}); the highest score is kept.",
                    },
                    {
                      count: review.rounds.length,
                      trail: roundsTrail(review.rounds),
                    }
                  )
                : t.formatMessage({ defaultMessage: "One reviewer." })}
          </p>
          {review.rounds.length > 1 && (
            <p>
              {t.formatMessage({
                defaultMessage:
                  "Each review guides the writing agents to improve the resume.",
              })}
            </p>
          )}
          {band === "capped" ? (
            <p className="text-foreground">
              {t.formatMessage({
                defaultMessage:
                  "Capped: a reviewer found something that disagrees with your profile.",
              })}
            </p>
          ) : (
            review.rating < review.target && (
              <p>
                {t.formatMessage({
                  defaultMessage:
                    "Answer the gap questions or complete your profile to raise it.",
                })}
              </p>
            )
          )}
          <ReviewerList review={review} />
        </div>
      )}
    </>
  );
}

function FeedbackList({
  title,
  items,
  destructive,
}: {
  title: string;
  items: string[];
  destructive?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p
        className={cn(
          "font-medium",
          destructive ? "text-destructive" : "text-foreground"
        )}
      >
        {title}
      </p>
      <ul className="list-disc space-y-0.5 pl-4">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Each reviewer as a collapsible row with the feedback they gave. */
function ReviewerList({ review }: { review: Review }) {
  const t = useTranslation();
  const needsAttention =
    review.rating < review.target || coverageScoreBand(review) === "capped";
  return (
    <div className="flex flex-col gap-1">
      {review.rounds.map((round, index) => {
        const empty =
          round.inconsistencies.length +
            round.advice.length +
            round.partial.length +
            round.notProven.length ===
          0;
        return (
          <Collapsible
            key={round.round}
            defaultOpen={round.kept && needsAttention}
            className="rounded-md border"
          >
            <CollapsibleTrigger
              disabled={empty}
              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
            >
              <span className="text-foreground font-medium">
                {t.formatMessage(
                  { defaultMessage: "Reviewer {number} · {rating}/10" },
                  {
                    number: t.formatNumber(index + 1),
                    rating: t.formatNumber(round.rating),
                  }
                )}
              </span>
              <span className="flex items-center gap-1.5">
                {round.kept && (
                  <Badge variant="secondary">
                    {t.formatMessage({ defaultMessage: "kept" })}
                  </Badge>
                )}
                {!empty && <ChevronDown className="size-3.5" />}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex max-h-60 flex-col gap-2 overflow-y-auto px-2 pb-2">
              <FeedbackList
                destructive
                title={t.formatMessage({
                  defaultMessage: "Disagrees with your profile",
                })}
                items={round.inconsistencies}
              />
              <FeedbackList
                title={t.formatMessage({
                  defaultMessage: "What it advised",
                })}
                items={round.advice}
              />
              <FeedbackList
                title={t.formatMessage({
                  defaultMessage: "Partially covered",
                })}
                items={round.partial}
              />
              <FeedbackList
                title={t.formatMessage({
                  defaultMessage: "Not shown in the resume",
                })}
                items={round.notProven}
              />
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

/**
 * The score as a badge in the document toolbar, always in view: it opens
 * the same card in a popover, and carries a dot while the text was edited
 * after the review. Nothing without a review.
 */
export function CoverageScoreBadge({ version }: { version: VersionView }) {
  const t = useTranslation();
  const label = useScoreLabel();
  const review = version.review;
  if (!review) return null;
  if (version.reviewing) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
            {t.formatMessage({ defaultMessage: "Reviewing…" })}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <ReviewProgress progress={version.reviewing.progress} />
        </PopoverContent>
      </Popover>
    );
  }
  const band = coverageScoreBand(review);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2">
          <Badge variant={badgeVariant[band]}>{label(review)}</Badge>
          {!review.current && (
            <span
              role="img"
              aria-label={t.formatMessage({
                defaultMessage: "Edited after the review",
              })}
              className="size-2 rounded-full bg-amber-500"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-96 w-80 flex-col gap-2 overflow-y-auto text-xs"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{label(review)}</span>
          <BandBadge band={band} />
        </div>
        <CoverageScoreBody version={version} showExplanation />
      </PopoverContent>
    </Popover>
  );
}
