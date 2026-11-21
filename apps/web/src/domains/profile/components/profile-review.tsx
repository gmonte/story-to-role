"use client";

import { useState } from "react";

import { Check, CircleAlert, EyeOff, Sparkles, X } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { extractProfile } from "@repo/api/domains/profile/truth/extract";
import { Button } from "@repo/web/components/ui/button";

import { decisionButton } from "~/domains/workspace/utils/decision-buttons";

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
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium uppercase">
        {t.formatMessage(
          { defaultMessage: "Quality review ({count, number})" },
          { count: reviewFindings.length }
        )}
        {reviewFindings.length > 0 && (
          <CircleAlert className="text-warning size-3.5" />
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
      <ul className="space-y-2">
        {reviewFindings.map((finding, index) => (
          <li
            key={`${finding.quote}-${index}`}
            className="bg-card flex flex-col gap-2 rounded-lg border p-3 text-[13px] leading-snug"
          >
            <button
              type="button"
              onClick={() =>
                goToLine(finding.line, { from: finding.from, to: finding.to })
              }
              className="text-left hover:underline"
            >
              <span className="block font-medium">
                {reviewKinds[finding.kind]}
              </span>
              <span className="text-muted-foreground">{finding.message}</span>
            </button>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground h-7 px-2.5 text-xs"
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
                <Sparkles className="text-brand-accent size-3" />
                {t.formatMessage({ defaultMessage: "Chat" })}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground h-7 px-2.5 text-xs"
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
          <ul className="space-y-2">
            {proposals.map((proposal) => (
              <li
                key={proposal.name}
                className="bg-card flex flex-col gap-2 rounded-lg border p-3 text-[13px] leading-snug"
              >
                <p>
                  <span className="font-medium">{proposal.name}</span>
                  {labelSeparator}
                  {levelLabels[proposal.level]}
                </p>
                <p className="text-muted-foreground">{proposal.reason}</p>
                <div className="flex gap-1.5">
                  <Button
                    className={decisionButton}
                    onClick={() =>
                      applyCompetencyLevel(proposal.name, proposal.level)
                    }
                  >
                    <Check />
                    {t.formatMessage({ defaultMessage: "Accept" })}
                  </Button>
                  <Button
                    variant="outline"
                    className={decisionButton}
                    onClick={() =>
                      setRejected((names) => [...names, proposal.name])
                    }
                  >
                    <X />
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
