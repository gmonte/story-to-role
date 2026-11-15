import type { DbClient } from "@repo/api/tools/db-client";
import type { SensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";

import type { AiFunding } from "./ai-funding";
import { AiUsageRepository } from "./ai-usage-repository";
import type {
  AiAgentRequest,
  AiObjectRequest,
  AiRole,
  AiSearchRequest,
  AiSource,
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
  runAgent(
    request: AiAgentRequest & { purpose: string }
  ): Promise<{ text: string; usages: AiUsage[] }>;
  searchWeb(
    request: AiSearchRequest & { purpose: string }
  ): Promise<{ text: string; sources: AiSource[]; usages: AiUsage[] }>;
};

/**
 * The only way tasks call a model: every call goes through the user's
 * provider package and records its token usage. With a sensitive filter,
 * the system prompt (where stored career facts go) is rewritten by the
 * user's sensitivity choices before it leaves: an excluded item can't reach
 * a prompt whatever the caller built. Messages are left as written: they are
 * the user's live words in the current session.
 */
export function createAiClient({
  db,
  userId,
  taskId,
  funding,
  providerPackage,
  sensitiveFilter,
}: {
  db: DbClient;
  userId: string;
  taskId?: string;
  funding: AiFunding;
  providerPackage: ProviderPackage;
  sensitiveFilter?: SensitiveFilter;
}): AiClient {
  const guard = <R extends { system: string }>(request: R): R =>
    sensitiveFilter
      ? { ...request, system: sensitiveFilter.apply(request.system) }
      : request;

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
      const result = await providerPackage.generateText(guard(request));
      await recordUsage(purpose, request.role, result.usage);
      return result;
    },

    async generateObject({ purpose, ...request }) {
      const result = await providerPackage.generateObject(guard(request));
      await recordUsage(purpose, request.role, result.usage);
      return result;
    },

    async runAgent({ purpose, ...request }) {
      const result = await providerPackage.runAgent(guard(request));
      for (const usage of result.usages) {
        await recordUsage(purpose, request.role, usage);
      }
      return result;
    },

    async searchWeb({ purpose, ...request }) {
      const result = await providerPackage.searchWeb(guard(request));
      for (const usage of result.usages) {
        await recordUsage(purpose, request.role, usage);
      }
      return result;
    },
  };
}
