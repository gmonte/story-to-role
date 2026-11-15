import { TRPCError } from "@trpc/server";

import { currentPlan } from "@repo/api/domains/credits/credit-plan";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { AiKeysRepository } from "./ai-keys-repository";
import { createAnthropicPackage } from "./providers/anthropic-package";
import {
  KeyUnusableError,
  type ProviderPackage,
} from "./providers/provider-package";
import type { AiKeyStatus, AiKeyView } from "./schemas/ai-keys";

type PackageFactory = (input: { apiKey: string }) => ProviderPackage;

/**
 * The user's own provider key (guided interview spec, "AI providers";
 * billing spec: key funding is for the paid plan). Saved only once a
 * minimal call proves it works, never shown again but for its last
 * characters, decrypted in memory only for a call, deleted on removal.
 */
export class AiKeysService {
  constructor(
    private readonly db: DbClient,
    private readonly makePackage: PackageFactory = createAnthropicPackage
  ) {}

  async get(userId: string): Promise<AiKeyView | null> {
    const row = await new AiKeysRepository(this.db).findByUserId(userId);
    return (
      row && {
        provider: row.provider,
        lastCharacters: row.lastCharacters,
        status: row.status,
        statusChangedAt: row.statusChangedAt,
        createdAt: row.createdAt,
      }
    );
  }

  async save(input: { userId: string; apiKey: string }) {
    const apiKey = input.apiKey.trim();
    if (
      (await currentPlan(this.db, input.userId, new Date())).kind === "free"
    ) {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }
    // A refused key isn't saved; one without credit is (a Claude Max or
    // Team key waiting for its monthly credits), marked as such.
    const status = await this.check(apiKey);
    if (status === "refused") throw keyRefused(new KeyUnusableError(status));
    const cipher = await getUserCipher(this.db, input.userId);
    await new AiKeysRepository(this.db).upsert({
      userId: input.userId,
      encryptedKey: cipher.encrypt(apiKey),
      lastCharacters: apiKey.slice(-4),
      status,
      now: new Date(),
    });
    return { status };
  }

  /** Checks a saved key again (its credit renewed, say) and records it. */
  async recheck(userId: string) {
    const repository = new AiKeysRepository(this.db);
    const row = await repository.findByUserId(userId);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    const cipher = await getUserCipher(this.db, userId);
    const status = await this.check(cipher.decrypt(row.encryptedKey));
    await repository.setStatus(userId, status, new Date());
    return { status };
  }

  async remove(userId: string) {
    await new AiKeysRepository(this.db).delete(userId);
  }

  /** What the provider says of the key: works, out of credit, refused. */
  private async check(apiKey: string): Promise<AiKeyStatus> {
    try {
      await this.makePackage({ apiKey }).validateKey();
      return "active";
    } catch (error) {
      if (error instanceof KeyUnusableError) return error.reason;
      throw error;
    }
  }
}

/** The interface reads the reason from the error's data (tools/trpc). */
const keyRefused = (error: KeyUnusableError) =>
  new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error });
