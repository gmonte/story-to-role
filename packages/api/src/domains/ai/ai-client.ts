import type { DbClient } from "@repo/api/tools/db-client";

import type { AiFunding } from "./ai-funding";
import { AiUsageRepository } from "./ai-usage-repository";
import type {
  AiObjectRequest,
  AiRole,
  AiTextRequest,
  AiUsage,
  ProviderPackage,
} from "./providers/provider-package";

export type AiClient = {
  generateText(
    request: AiTextRequest & { purpose: string }
  ): Promise<{ text: string; usage: AiUsage }>;
  generateObject<T>(
    request: AiObjectRequest<T> & { purpose: string }
  ): Promise<{ object: T | null; usage: AiUsage }>;
};

/**
 * The only way tasks call a model: every call goes through the user's
 * provider package and records its token usage.
 */
export function createAiClient({
  db,
  userId,
  taskId,
  funding,
  providerPackage,
}: {
  db: DbClient;
  userId: string;
  taskId?: string;
  funding: AiFunding;
  providerPackage: ProviderPackage;
}): AiClient {
  async function recordUsage(purpose: string, role: AiRole, usage: AiUsage) {
    await new AiUsageRepository(db).record({
      userId,
      taskId,
      purpose,
      funding,
      provider: providerPackage.provider,
      role,
      ...usage,
    });
  }

  return {
    async generateText({ purpose, ...request }) {
      const result = await providerPackage.generateText(request);
      await recordUsage(purpose, request.role, result.usage);
      return result;
    },

    async generateObject({ purpose, ...request }) {
      const result = await providerPackage.generateObject(request);
      await recordUsage(purpose, request.role, result.usage);
      return result;
    },
  };
}
