import type { AiUsage } from "@repo/api/domains/ai/providers/provider-package";
import type { TaskType } from "@repo/api/domains/tasks/schemas/task";

import type { CreditScope } from "./schemas/credits";

/** US$ per million tokens (billing spec, "Cost model"; Claude API prices). */
const modelPrices: Record<
  string,
  { input: number; output: number; cacheRead: number }
> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
};
// Unknown models are priced as the most expensive one: never undercharged.
const fallbackPrice = modelPrices["claude-opus-5-5"];

export const creditSettings = {
  // One credit is about US$0.01 of AI cost with a 1.5x safety margin.
  usdPerCredit: 0.01,
  margin: 1.5,
  welcomeCredits: 200,
  monthlyFreeCredits: 10,
  // The subscription's monthly credits and a pack's (billing spec,
  // "Prices": the initial hypothesis).
  subscriptionMonthlyCredits: 600,
  packCredits: 300,
  packValidityMonths: 12,
};

/** What AI calls cost the provider's customer, in US$ (no margin). */
export function usdForUsage(usages: AiUsage[]) {
  return usages.reduce((total, usage) => {
    const price = modelPrices[usage.model] ?? fallbackPrice;
    const uncachedInput =
      usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens;
    return (
      total +
      (Math.max(0, uncachedInput) * price.input +
        usage.cacheWriteTokens * price.input * 1.25 +
        usage.cacheReadTokens * price.cacheRead +
        usage.outputTokens * price.output) /
        1_000_000
    );
  }, 0);
}

/** What a task's AI calls cost, in credits, rounded up. */
export function creditsForUsage(usages: AiUsage[]) {
  return Math.ceil(
    (usdForUsage(usages) * creditSettings.margin) / creditSettings.usdPerCredit
  );
}

/** What an action may need to know to cap its cost. */
export type CapHints = {
  positions?: number;
  thorough?: boolean;
  maximum?: boolean;
  documentKind?: "resume" | "cover_letter";
  // The profile parts a validation reviews.
  parts?: number;
};

/**
 * "Up to N credits" (billing spec, "Estimate with a cap"): the most an
 * action may cost, reserved when it starts. It settles to the actual cost
 * and is never exceeded. Actions without AI cost nothing.
 */
export function creditCap(type: TaskType, hints: CapHints = {}): number {
  const level = hints.maximum ? 2 : 1;
  switch (type) {
    case "analyze_opening":
      return 3;
    case "motivation_turn":
    case "split_instructions":
    case "extract_style_profile":
      return 3;
    case "research_company":
      return 20;
    case "adapt_document":
      return 10 * level;
    case "generate_document": {
      if (hints.documentKind === "cover_letter") return 20 * level;
      // About 37 to 55 for Quick at the standard level, by career length.
      const base = Math.min(110, 30 + 5 * (hints.positions ?? 5));
      return base * level * (hints.thorough ? 2 : 1);
    }
    case "profile_agent_turn":
      // The topic gate plus the agent's reply: about 2, capped at 3.
      return 3;
    case "validate_profile":
      // About 5 for one changed part, up to 20 or so for a whole profile.
      return Math.min(25, 3 + 2 * Math.max(1, hints.parts ?? 1));
    case "sample":
    case "render_pdf":
    case "embed_profile":
      return 0;
  }
}

/** Free's monthly credits pay for fit checks only. */
export const scopeOf = (type: TaskType): CreditScope =>
  type === "analyze_opening" ? "fit_check" : "any";
