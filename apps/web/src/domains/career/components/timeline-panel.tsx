"use client";

import { ChevronDown, Plus } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/web/components/ui/collapsible";

import { useTimeline } from "../hooks/use-career-queries";
import { useCareerWorkspace } from "./career-workspace-context";
import { CredentialsSection } from "./credentials-section";
import { NarrativeCard } from "./narrative-card";
import { PositionCard } from "./position-card";
import { PositionFormDialog } from "./position-form-dialog";
import { ProposalCards } from "./proposal-cards";
import { SensitiveReview } from "./sensitive-review";
import { Sources } from "./sources";

/** The side panel of My career: the timeline of positions and its tools. */
export function TimelinePanel() {
  const t = useTranslation();
  const timeline = useTimeline();
  const { setPreviewSourceDocumentId } = useCareerWorkspace();

  // Nothing to import or review before the privacy notice is acknowledged.
  if (!timeline.data?.profile.privacyNoticeAccepted) return null;
  const { positions, removedPositions } = timeline.data;
  const bilingual = timeline.data.evidenceLanguages.length > 1;
  return (
    <div className="flex flex-col gap-6">
      <Sources
        documents={timeline.data.documents}
        onPreview={setPreviewSourceDocumentId}
      />
      <ProposalCards
        proposals={timeline.data.proposals}
        positions={positions}
      />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {t.formatMessage({ defaultMessage: "Timeline" })}
          </h3>
          <PositionFormDialog
            trigger={
              <Button size="sm" variant="ghost">
                <Plus />
                {t.formatMessage({ defaultMessage: "Add" })}
              </Button>
            }
          />
        </div>
        {positions.length === 0 && (
          <p className="text-muted-foreground text-xs">
            {t.formatMessage({
              defaultMessage: "Import a resume or add your positions by hand.",
            })}
          </p>
        )}
        {positions.map((position) => (
          <PositionCard
            key={position.id}
            position={position}
            others={positions.filter((other) => other.id !== position.id)}
            bilingual={bilingual}
          />
        ))}
        {removedPositions.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground w-full justify-between"
              >
                {t.formatMessage(
                  { defaultMessage: "Removed ({count})" },
                  { count: removedPositions.length }
                )}
                <ChevronDown />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-2 pt-2">
              {removedPositions.map((position) => (
                <PositionCard
                  key={position.id}
                  position={position}
                  others={[]}
                  bilingual={bilingual}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </section>

      <CredentialsSection credentials={timeline.data.credentials} />
      {/* After education, certifications and languages: the last check. */}
      <SensitiveReview />
      <NarrativeCard
        narrative={timeline.data.narrative}
        hasApprovedPositions={positions.some((p) => p.status === "approved")}
      />
    </div>
  );
}
