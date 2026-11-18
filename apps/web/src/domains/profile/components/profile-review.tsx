"use client";

import { useState } from "react";

import { Check, EyeOff, MessageSquare, X } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { extractProfile } from "@repo/api/domains/profile/truth/extract";
import { Button } from "@repo/web/components/ui/button";

import { useProfileLabels } from "../hooks/use-profile-labels";
import { useLatestValidation } from "../hooks/use-profile-validation";
import { useProfileEditor } from "./profile-editor-context";

const labelSeparator = ": ";

/**
 * The last validation's report beside the document (profile spec, "Validate
 * and publish"): each finding opens its passage, and the competency levels
 * it proposed wait for the user to accept or reject. Findings never block.
 */
export function ProfileReview() {
  const t = useTranslation();
  const { reviewKinds, levelLabels } = useProfileLabels();
  const {
    reviewFindings,
    ignoreReviewFinding,
    goToLine,
    blocks,
    applyCompetencyLevel,
    talkAbout,
  } = useProfileEditor();
  const validation = useLatestValidation();
  const [rejected, setRejected] = useState<string[]>([]);
  const report = validation.data?.report;
  if (!report) return null;

  // A proposal already applied (or rejected) leaves the list.
  const levels = new Map(
    extractProfile(blocks).competencies.map((c) => [
      c.name.toLowerCase(),
      c.level,
    ])
  );
  const proposals = report.competencies.filter(
    (proposal) =>
      !rejected.includes(proposal.name) &&
      levels.get(proposal.name.toLowerCase()) !== proposal.level
  );

  return (
    <section className="space-y-2">
      <p className="text-muted-foreground text-xs font-medium uppercase">
        {t.formatMessage(
          { defaultMessage: "Quality review ({count, number})" },
          { count: reviewFindings.length }
        )}
      </p>
      {reviewFindings.length === 0 && (
        <p className="text-muted-foreground text-xs">
          {t.formatMessage({
            defaultMessage:
              "The review found nothing to look at in what changed.",
          })}
        </p>
      )}
      <ul className="space-y-1">
        {reviewFindings.map((finding, index) => (
          <li key={`${finding.quote}-${index}`}>
            <button
              type="button"
              onClick={() =>
                goToLine(finding.line, { from: finding.from, to: finding.to })
              }
              className="hover:bg-muted w-full rounded px-2 py-1 text-left text-xs"
            >
              <span className="text-primary block font-medium">
                {reviewKinds[finding.kind]}
              </span>
              <span className="text-muted-foreground">{finding.message}</span>
            </button>
            <div className="flex flex-wrap items-center gap-1 px-2 pb-1">
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground h-6 px-2 text-xs"
                title={t.formatMessage({ defaultMessage: "Talk about this" })}
                aria-label={t.formatMessage({
                  defaultMessage: "Talk about this",
                })}
                onClick={() =>
                  talkAbout({
                    quote: finding.quote,
                    line: finding.line,
                    attachment: { kind: "review", text: finding.message },
                  })
                }
              >
                <MessageSquare className="size-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground h-6 px-2 text-xs"
                title={t.formatMessage({
                  defaultMessage: "This finding doesn't apply: stop showing it",
                })}
                onClick={() => ignoreReviewFinding(finding)}
              >
                <EyeOff className="size-3" />
                {t.formatMessage({ defaultMessage: "Ignore" })}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {proposals.length > 0 && (
        <div className="space-y-1 pt-2">
          <p className="text-muted-foreground text-xs font-medium">
            {t.formatMessage({ defaultMessage: "Proposed competency levels" })}
          </p>
          <ul className="space-y-1">
            {proposals.map((proposal) => (
              <li key={proposal.name} className="rounded border p-2 text-xs">
                <p>
                  <span className="font-medium">{proposal.name}</span>
                  {labelSeparator}
                  {levelLabels[proposal.level]}
                </p>
                <p className="text-muted-foreground mt-0.5">
                  {proposal.reason}
                </p>
                <div className="mt-1 flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      applyCompetencyLevel(proposal.name, proposal.level)
                    }
                  >
                    <Check className="size-3" />
                    {t.formatMessage({ defaultMessage: "Accept" })}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      setRejected((names) => [...names, proposal.name])
                    }
                  >
                    <X className="size-3" />
                    {t.formatMessage({ defaultMessage: "Reject" })}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
