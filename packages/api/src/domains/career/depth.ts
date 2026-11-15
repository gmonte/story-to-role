import type { ScriptKind } from "./schemas/career";

export const depthLevels = [
  "confirmed",
  "contextualized",
  "with_stories",
  "evidenced",
  "complete",
] as const;
export type DepthLevel = (typeof depthLevels)[number];

export type DepthInput = {
  hasDates: boolean;
  scriptKind: ScriptKind;
  approved: boolean;
  // The interview got past the context stage (company, team, scale, projects).
  reachedContext: boolean;
  storyCount: number;
  // Texts of the approved achievements and metrics.
  achievements: string[];
  toolCount: number;
  sensitivePending: number;
};

export type Depth = {
  level: DepthLevel | null;
  // A short-script position needs nothing more once it has stories.
  done: boolean;
  counts: { evidence: number; resultsWithNumbers: number; stories: number };
  nudge: { kind: "achievements_without_number"; count: number } | null;
};

// A result "with a number" measures something: a figure of two or more
// digits, a percentage or multiple, money, or a number with a unit
// ("6 engineers", "2 hours"). "Python 3" is not a result.
const measuredNumber =
  /(\d{2,}|\d+([.,]\d+)?\s*(%|x\b|k\b|m\b|mi\b|bi\b|h\b|min|hours?|days?|weeks?|months?|years?|horas?|dias?|semanas?|meses|m[eê]s|anos?|people|pessoas|engineers|engenheiros|users|usu[aá]rios|customers|clientes|services|servi[cç]os|teams?|times?|squads?)|(R\$|US\$|\$|€|£)\s?\d)/i;
const hasNumber = (text: string) => measuredNumber.test(text);

/**
 * How complete a position's story is, shown beside its workflow status as a
 * named level that follows the interview script (guided interview spec).
 */
export function computeDepth(input: DepthInput): Depth {
  const resultsWithNumbers = input.achievements.filter(hasNumber).length;
  const withoutNumber = input.achievements.length - resultsWithNumbers;

  let level: DepthLevel | null = null;
  if (input.hasDates) {
    level = "confirmed";
    if (input.reachedContext) level = "contextualized";
    if (level === "contextualized" && input.storyCount > 0) {
      level = "with_stories";
    }
    if (
      level === "with_stories" &&
      resultsWithNumbers > 0 &&
      input.toolCount > 0
    ) {
      level = "evidenced";
    }
    if (
      level === "evidenced" &&
      input.approved &&
      input.sensitivePending === 0
    ) {
      level = "complete";
    }
  }

  const reached = level ? depthLevels.indexOf(level) : -1;
  const done =
    level === "complete" ||
    (input.scriptKind === "short" &&
      reached >= depthLevels.indexOf("with_stories"));

  return {
    level,
    done,
    counts: {
      evidence: input.achievements.length,
      resultsWithNumbers,
      stories: input.storyCount,
    },
    nudge:
      withoutNumber > 0
        ? { kind: "achievements_without_number", count: withoutNumber }
        : null,
  };
}
