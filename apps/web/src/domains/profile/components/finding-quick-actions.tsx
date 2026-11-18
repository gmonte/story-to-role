"use client";

import { useState } from "react";

import { Plus } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import type { ProfileFinding } from "@repo/api/domains/profile/truth/lint";
import { Button } from "@repo/web/components/ui/button";

import { useProfileLabels } from "../hooks/use-profile-labels";
import { useProfileEditor } from "./profile-editor-context";

/**
 * The one-click edits of a finding, decided by code (no AI, no credits):
 * adding a competency at a level, moving it to Studied, a certification's
 * status, the “not done” line. Shown in the hover card and the list.
 */
export function FindingQuickActions({
  finding,
  onApplied,
  goTo = true,
}: {
  finding: ProfileFinding;
  onApplied?: () => void;
  // Whether applying scrolls to the changed line (the list) or stays put.
  goTo?: boolean;
}) {
  const t = useTranslation();
  const { levelLabels } = useProfileLabels();
  const { quickActions, applyQuickAction } = useProfileEditor();
  const [choosing, setChoosing] = useState(false);
  const actions = quickActions(finding);
  if (!actions.length) return null;

  const run = (action: (typeof actions)[number]) => {
    applyQuickAction(action, { goTo });
    onApplied?.();
  };
  const labels: Record<string, string> = {
    moveToStudied: t.formatMessage({ defaultMessage: "Move to Studied" }),
    certificationValid: t.formatMessage({ defaultMessage: "Valid" }),
    certificationRenewing: t.formatMessage({ defaultMessage: "Renewing" }),
    addNotDone: t.formatMessage({ defaultMessage: "Add the line" }),
  };

  if (actions[0].id === "addCompetency") {
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          aria-expanded={choosing}
          onClick={() => setChoosing((value) => !value)}
        >
          <Plus className="size-3" />
          {t.formatMessage({ defaultMessage: "Add to competencies" })}
        </Button>
        {choosing && (
          <div className="flex w-full flex-wrap gap-1">
            {actions.map((action) => (
              <Button
                key={action.level}
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => run(action)}
              >
                {action.level ? levelLabels[action.level] : ""}
              </Button>
            ))}
          </div>
        )}
      </>
    );
  }

  return actions.map((action) => (
    <Button
      key={action.id}
      size="sm"
      variant="outline"
      className="h-6 px-2 text-xs"
      onClick={() => run(action)}
    >
      {labels[action.id]}
    </Button>
  ));
}
