import type { ProfileBlock } from "./blocks";
import { insertEntry, setCompetencyLevel } from "./insert";
import type { ProfileFinding } from "./lint";
import {
  skillLevels,
  experienceFieldLabels,
  type CompetencyLevel,
  type ProfileLanguage,
} from "./sections";
import { readStructure } from "./structure";

/**
 * A one-click edit offered on a finding (profile spec, "The linter"): code
 * decides it, so there is no AI call and no credits.
 */
export type QuickActionId =
  | "addCompetency"
  | "moveToStudied"
  | "certificationValid"
  | "certificationRenewing"
  | "addNotDone";

export type QuickAction = {
  id: QuickActionId;
  // The level an `addCompetency` adds the name at.
  level?: CompetencyLevel;
  // The document after the action, and the line to put the cursor on.
  blocks: ProfileBlock[];
  line: number;
};

const statusWords: Record<
  ProfileLanguage,
  { valid: string; renewing: string }
> = {
  "pt-BR": { valid: "válida", renewing: "em renovação" },
  "en-US": { valid: "valid", renewing: "renewing" },
};

function setStatus(
  blocks: ProfileBlock[],
  finding: ProfileFinding,
  status: string
): ProfileBlock[] | null {
  const block = finding.line === null ? null : blocks[finding.line];
  if (!block || finding.line === null) return null;
  // A line without a status gets one; a blank or unknown one is replaced.
  const text =
    finding.from === 0
      ? `${block.text} — ${status}`
      : `${block.text.slice(0, finding.from)}${status}`;
  return blocks.map((b, i) => (i === finding.line ? { ...b, text } : b));
}

export function quickActionsFor(
  finding: ProfileFinding,
  blocks: ProfileBlock[],
  language: ProfileLanguage
): QuickAction[] {
  const name = finding.params?.name;
  switch (finding.code) {
    case "competencyMissing": {
      if (!name) return [];
      // A tool an experience names is used: never a concept.
      return skillLevels.map((level) => {
        const result = insertEntry(blocks, { kind: "competency", name, level });
        return {
          id: "addCompetency" as const,
          level,
          blocks: result.blocks,
          line: result.line,
        };
      });
    }
    case "competencyUnbacked": {
      if (!name) return [];
      const next = setCompetencyLevel(blocks, name, "studied");
      return [
        {
          id: "moveToStudied",
          blocks: next,
          line: finding.line ?? 0,
        },
      ];
    }
    case "certificationStatus": {
      const actions: QuickAction[] = [];
      const options = [
        ["certificationValid", statusWords[language].valid],
        ["certificationRenewing", statusWords[language].renewing],
      ] as const;
      for (const [id, word] of options) {
        const next = setStatus(blocks, finding, word);
        if (next && finding.line !== null)
          actions.push({ id, blocks: next, line: finding.line });
      }
      return actions;
    }
    case "missingNotDone": {
      const experience = readStructure(blocks).experiences.find(
        (candidate) =>
          finding.line !== null &&
          finding.line >= candidate.heading &&
          finding.line < candidate.end
      );
      if (!experience) return [];
      const existing = experience.fields.notDone;
      // The label is there but empty: only the cursor has to go to it.
      if (existing) return [{ id: "addNotDone", blocks, line: existing.line }];
      const at = experience.end;
      const line: ProfileBlock = {
        type: "item",
        depth: 0,
        text: `${experienceFieldLabels[language].notDone}:`,
      };
      return [
        {
          id: "addNotDone",
          blocks: [...blocks.slice(0, at), line, ...blocks.slice(at)],
          line: at,
        },
      ];
    }
    default:
      return [];
  }
}
