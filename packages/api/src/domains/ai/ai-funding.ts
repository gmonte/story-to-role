import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

import { env } from "@repo/common/env/web.env";
import type { DbClient } from "@repo/api/tools/db-client";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";

import { AiKeysRepository } from "./ai-keys-repository";
import { createAnthropicPackage } from "./providers/anthropic-package";
import {
  KeyUnusableError,
  type ProviderPackage,
} from "./providers/provider-package";

/** Who pays for a user's AI calls. */
export type AiFunding = "credits" | "key";

export type ResolvedAiFunding = {
  funding: AiFunding;
  providerPackage: ProviderPackage;
  // The career chat's streamed orchestrator calls the provider through the
  // AI SDK on the same funding; the key stays inside this closure.
  languageModel: (modelId: string) => LanguageModel;
};

/**
 * The provider package a task's calls run on, by the funding decided when
 * it started. Every call of the task, the topic gate included, follows the
 * same funding: a key-funded task never spends StoryToRole's key, and a
 * credit-funded one never the user's.
 */
export async function resolveAiFunding(input: {
  db: DbClient;
  userId: string;
  cipher: UserCipher;
  funding: AiFunding;
}): Promise<ResolvedAiFunding> {
  if (input.funding === "credits") {
    return {
      funding: "credits",
      providerPackage: createAnthropicPackage({
        apiKey: env.ANTHROPIC_API_KEY,
      }),
      languageModel: (modelId) =>
        createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(modelId),
    };
  }
  const key = await new AiKeysRepository(input.db).findByUserId(input.userId);
  // Removed, or marked unusable by another task meanwhile: the task stops
  // without calling the provider.
  if (!key) throw new KeyUnusableError("refused");
  if (key.status !== "active") throw new KeyUnusableError(key.status);
  // Decrypted in memory for this task's calls only.
  const apiKey = input.cipher.decrypt(key.encryptedKey);
  return {
    funding: "key",
    providerPackage: createAnthropicPackage({ apiKey }),
    languageModel: (modelId) => createAnthropic({ apiKey })(modelId),
  };
}
