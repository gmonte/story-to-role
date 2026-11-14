import { env } from "@repo/common/env/web.env";

import { createAnthropicPackage } from "./providers/anthropic-package";
import type { ProviderPackage } from "./providers/provider-package";

/** Who pays for a user's AI calls. */
export type AiFunding = "credits" | "key";

export type ResolvedAiFunding = {
  funding: AiFunding;
  providerPackage: ProviderPackage;
};

/**
 * Picks the funding and the provider package a user's calls run on. Every
 * call of a user, the topic gate included, follows the same funding: a user
 * with their own key never spends StoryToRole's.
 *
 * Bring-your-own keys arrive with billing (slice 6); until then every user
 * is credit-funded on StoryToRole's Anthropic key.
 */
export function resolveAiFunding(): ResolvedAiFunding {
  return {
    funding: "credits",
    providerPackage: createAnthropicPackage({ apiKey: env.ANTHROPIC_API_KEY }),
  };
}
