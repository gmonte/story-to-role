"use client";

import { useState } from "react";

import { ChevronDown } from "lucide-react";

import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { cn } from "@repo/web/lib/utils";

import { coverageScoreBand, roundsTrail } from "../utils/coverage-score";

const badgeVariant = {
  good: "default",
  middling: "secondary",
  low: "destructive",
  capped: "destructive",
} as const;

/**
 * The rating the resume earned in its review rounds, in plain words
 * (resume spec, "Review rounds"): how much of what the purpose asks, among
 * what the profile backs, the resume covers. Never a percentage; the
 * explanation opens under it.
 */
export function CoverageScore({ version }: { version: VersionView }) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const review = version.review;
  if (!review) return null;

  const band = coverageScoreBand(review);
  const purpose = review.purpose;

  return (
    <div className="bg-background flex flex-col gap-2 rounded-lg border p-2.5 text-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-medium">
          {t.formatMessage(
            {
              defaultMessage: "Match score {rating}/{target}",
            },
            {
              rating: t.formatNumber(review.rating),
              target: t.formatNumber(review.target),
            }
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <Badge variant={badgeVariant[band]}>
            {t.formatMessage(
              {
                defaultMessage:
                  "{band, select, good {Strong} middling {Fair} capped {Capped} other {Low}}",
              },
              { band }
            )}
          </Badge>
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              open && "rotate-180"
            )}
          />
        </span>
      </button>

      {open && (
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
            {review.rounds.length > 1
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
        </div>
      )}
    </div>
  );
}
