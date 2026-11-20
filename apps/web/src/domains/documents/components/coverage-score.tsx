"use client";

import { useState } from "react";

import { ChevronDown, MessageSquare } from "lucide-react";

import {
  reviewerAttachment,
  type ReviewerFeedbackSection,
} from "@repo/api/domains/documents/agent/reviewer-attachment";
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
import { useDocumentAgent } from "./document-agent-context";
import {
  ReviewAgainButton,
  ReviewProgress,
  StaleReviewNotice,
} from "./review-again";

const badgeVariant = {
  good: "default",
  middling: "secondary",
  low: "destructive",
} as const;

type Review = NonNullable<VersionView["review"]>;

/** “Resume score 8/10”. */
function useScoreLabel() {
  const t = useTranslation();
  return (review: Review) =>
    t.formatMessage(
      { defaultMessage: "Resume score {rating}/10" },
      { rating: t.formatNumber(review.rating) }
    );
}

/** The band in a word: Strong, Fair or Low. */
function BandBadge({ band }: { band: keyof typeof badgeVariant }) {
  const t = useTranslation();
  return (
    <Badge variant={badgeVariant[band]}>
      {t.formatMessage(
        {
          defaultMessage:
            "{band, select, good {Strong} middling {Fair} other {Low}}",
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
  const purpose = review.purpose;

  return (
    <>
      <ContradictionsWarning review={review} />
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
                  "The score StoryToRole’s reviewers gave this resume for the {purpose, select, focus {focus} other {opening}}.",
              },
              { purpose }
            )}
          </p>
          <p>
            {review.ofEdit && review.rounds.length > 1
              ? t.formatMessage(
                  {
                    defaultMessage:
                      "{count} reviewers in parallel: {trail} — kept {rating}",
                  },
                  {
                    count: review.rounds.length,
                    trail: roundsTrail(review.rounds),
                    rating: t.formatNumber(review.rating),
                  }
                )
              : review.ofEdit
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
          {review.rating < review.target && (
            <p>
              {t.formatMessage({
                defaultMessage:
                  "Answer the gap questions or complete your profile to raise it.",
              })}
            </p>
          )}
          <ReviewerList review={review} />
        </div>
      )}
    </>
  );
}

/** The count of points a reviewer found that disagree with the profile. */
function ContradictionsWarning({ review }: { review: Review }) {
  const t = useTranslation();
  if (review.inconsistencies === 0) return null;
  return (
    <p className="text-destructive font-medium">
      {t.formatMessage(
        {
          defaultMessage:
            "{count, plural, one {# point disagrees} other {# points disagree}} with your profile",
        },
        { count: review.inconsistencies }
      )}
    </p>
  );
}

type Round = Review["rounds"][number];

/** Who said it: the reviewer's number and rating, for the attachment. */
type Reviewer = { number: number; rating: number };

/**
 * A small “Talk about this” button: it sends a piece of reviewer feedback
 * to the document agent as an attachment (nothing where there is no agent).
 */
function TalkAboutButton({
  label,
  attachment,
}: {
  label: string;
  attachment: ReturnType<typeof reviewerAttachment>;
}) {
  const agent = useDocumentAgent();
  if (!agent) return null;
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="text-muted-foreground size-5 shrink-0"
      aria-label={label}
      title={label}
      onClick={() => agent.talkAbout({ attachment })}
    >
      <MessageSquare className="size-3" />
    </Button>
  );
}

/** “Talk about this” for one item of a reviewer's feedback. */
function TalkAboutItem({
  reviewer,
  section,
  text,
  quote,
  profileLine,
}: {
  reviewer: Reviewer;
  section: ReviewerFeedbackSection;
  text: string;
  quote?: string | null;
  profileLine?: string | null;
}) {
  const t = useTranslation();
  return (
    <TalkAboutButton
      label={t.formatMessage({ defaultMessage: "Talk about this" })}
      attachment={reviewerAttachment({
        section,
        reviewer: reviewer.number,
        rating: reviewer.rating,
        text,
        quote,
        profileLine,
      })}
    />
  );
}

/** Everything one reviewer said, as the text of one attachment. */
function wholeReview(round: Round) {
  return [
    ...round.inconsistencies.map((item) =>
      item.quote
        ? `Contradiction: “${item.quote}”${item.profileLine ? ` (profile: “${item.profileLine}”)` : ""}`
        : `Contradiction: ${item.text ?? ""}`
    ),
    ...round.advice.map((item) => `Advice: ${item}`),
    ...round.partial.map((item) => `Partially covered: ${item}`),
    ...round.notProven.map((item) => `Not shown: ${item}`),
  ].join("\n");
}

/** Each contradiction with its quote from the resume and the profile line. */
function ContradictionList({
  items,
  reviewer,
}: {
  items: Round["inconsistencies"];
  reviewer: Reviewer;
}) {
  const t = useTranslation();
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-destructive font-medium">
        {t.formatMessage({ defaultMessage: "Disagrees with your profile" })}
      </p>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li key={index} className="group flex items-start gap-1.5">
            <span
              aria-hidden
              className="bg-muted-foreground mt-1.5 size-1 shrink-0 rounded-full"
            />
            <span className="min-w-0 flex-1">
              {item.quote ? (
                <>
                  <span className="text-foreground">
                    {t.formatMessage(
                      { defaultMessage: "“{quote}”" },
                      { quote: item.quote }
                    )}
                  </span>
                  {item.profileLine && (
                    <span className="block">
                      {t.formatMessage(
                        { defaultMessage: "Your profile: {line}" },
                        { line: item.profileLine }
                      )}
                    </span>
                  )}
                </>
              ) : (
                item.text
              )}
            </span>
            <TalkAboutItem
              reviewer={reviewer}
              section="contradiction"
              text={
                item.text ??
                t.formatMessage({
                  defaultMessage: "Disagrees with your profile",
                })
              }
              quote={item.quote}
              profileLine={item.profileLine}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeedbackList({
  title,
  items,
  section,
  reviewer,
}: {
  title: string;
  items: string[];
  section: ReviewerFeedbackSection;
  reviewer: Reviewer;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-foreground font-medium">{title}</p>
      <ul className="space-y-0.5">
        {items.map((item, index) => (
          <li key={index} className="group flex items-start gap-1.5">
            <span
              aria-hidden
              className="bg-muted-foreground mt-1.5 size-1 shrink-0 rounded-full"
            />
            <span className="min-w-0 flex-1">{item}</span>
            <TalkAboutItem reviewer={reviewer} section={section} text={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** “Talk about this review”: the reviewer's whole feedback to the agent. */
function TalkAboutWholeReview({
  reviewer,
  round,
}: {
  reviewer: Reviewer;
  round: Round;
}) {
  const t = useTranslation();
  const agent = useDocumentAgent();
  if (!agent) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-muted-foreground h-6 gap-1 px-2 text-xs"
      onClick={() =>
        agent.talkAbout({
          attachment: reviewerAttachment({
            section: "review",
            reviewer: reviewer.number,
            rating: reviewer.rating,
            text: wholeReview(round),
          }),
        })
      }
    >
      <MessageSquare className="size-3" />
      {t.formatMessage({ defaultMessage: "Talk about this review" })}
    </Button>
  );
}

/** Each reviewer as a collapsible row with the feedback they gave. */
function ReviewerList({ review }: { review: Review }) {
  const t = useTranslation();
  const needsAttention =
    review.rating < review.target || review.inconsistencies > 0;
  return (
    <div className="flex flex-col gap-1">
      {review.rounds.map((round, index) => {
        const empty =
          round.inconsistencies.length +
            round.advice.length +
            round.partial.length +
            round.notProven.length ===
          0;
        const reviewer = { number: index + 1, rating: round.rating };
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
              <div className="flex justify-end">
                <TalkAboutWholeReview reviewer={reviewer} round={round} />
              </div>
              <ContradictionList
                items={round.inconsistencies}
                reviewer={reviewer}
              />
              <FeedbackList
                title={t.formatMessage({
                  defaultMessage: "What it advised",
                })}
                items={round.advice}
                section="advice"
                reviewer={reviewer}
              />
              <FeedbackList
                title={t.formatMessage({
                  defaultMessage: "Partially covered",
                })}
                items={round.partial}
                section="partial"
                reviewer={reviewer}
              />
              <FeedbackList
                title={t.formatMessage({
                  defaultMessage: "Not shown in the resume",
                })}
                items={round.notProven}
                section="not_shown"
                reviewer={reviewer}
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
export function CoverageScoreBadge({
  version,
  inline = false,
}: {
  version: VersionView;
  // Among other chips (the opening's header): no button padding.
  inline?: boolean;
}) {
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
        <Button
          size="sm"
          variant="ghost"
          className={cn("h-7 gap-1.5 px-2", inline && "h-auto p-0")}
        >
          <Badge variant={badgeVariant[band]}>{label(review)}</Badge>
          {review.inconsistencies > 0 && (
            <span
              role="img"
              aria-label={t.formatMessage(
                {
                  defaultMessage:
                    "{count, plural, one {# point disagrees} other {# points disagree}} with your profile",
                },
                { count: review.inconsistencies }
              )}
              className="bg-destructive size-2 rounded-full"
            />
          )}
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
