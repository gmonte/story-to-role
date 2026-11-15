"use client";

import { useMutation } from "@tanstack/react-query";

import type {
  PositionView,
  TimelineProposalView,
} from "@repo/api/domains/career/schemas/timeline";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshCareer } from "../hooks/use-career-queries";

/**
 * Timeline changes the interviewer proposed. Nothing changes until the user
 * accepts (guided interview spec): the agent never decides for them.
 */
export function ProposalCards({
  proposals,
  positions,
}: {
  proposals: TimelineProposalView[];
  positions: PositionView[];
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const onError = (error: { message: string }) => toast.error(error.message);
  const accept = useMutation(
    trpc.career.acceptProposal.mutationOptions({ onSuccess: refresh, onError })
  );
  const reject = useMutation(
    trpc.career.rejectProposal.mutationOptions({ onSuccess: refresh, onError })
  );

  const nameOf = (positionId: unknown) => {
    const position = positions.find((p) => p.id === positionId);
    return position ? `${position.title} · ${position.employer}` : "";
  };

  const describe = (proposal: TimelineProposalView) => {
    const p = proposal.payload as Record<string, string | undefined>;
    switch (proposal.kind) {
      case "update_position": {
        const changes = [
          p.title,
          p.employer,
          p.location,
          p.startDate,
          p.endDate === "current"
            ? t.formatMessage({ defaultMessage: "still there" })
            : p.endDate,
        ]
          .filter(Boolean)
          .join(" · ");
        return t.formatMessage(
          { defaultMessage: "Correct {position}: {changes}" },
          { position: nameOf(p.positionId), changes }
        );
      }
      case "add_position":
        return t.formatMessage(
          { defaultMessage: "Add {title} at {employer}" },
          { title: p.title, employer: p.employer }
        );
      case "remove_position":
        return t.formatMessage(
          { defaultMessage: "Remove {position}" },
          { position: nameOf(p.positionId) }
        );
      case "merge_positions":
        return t.formatMessage(
          { defaultMessage: "Merge {position} into {into}" },
          { position: nameOf(p.positionId), into: nameOf(p.intoPositionId) }
        );
      case "split_position":
        return t.formatMessage(
          { defaultMessage: "Split {position}: {title} from {start}" },
          { position: nameOf(p.positionId), title: p.title, start: p.startDate }
        );
    }
  };

  if (proposals.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {t.formatMessage({ defaultMessage: "Suggested changes" })}
      </h3>
      {proposals.map((proposal) => (
        <div
          key={proposal.id}
          className="flex flex-col gap-2 rounded-lg border border-dashed p-3"
        >
          <p className="text-sm">{describe(proposal)}</p>
          {typeof proposal.payload.reason === "string" && (
            <p className="text-muted-foreground text-xs">
              {proposal.payload.reason}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => accept.mutate({ timelineProposalId: proposal.id })}
            >
              {t.formatMessage({ defaultMessage: "Apply" })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => reject.mutate({ timelineProposalId: proposal.id })}
            >
              {t.formatMessage({ defaultMessage: "Dismiss" })}
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
