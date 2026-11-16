import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { EvidenceRepository } from "@repo/api/domains/evidence/evidence-repository";
import type { SensitivityChoice } from "@repo/api/domains/evidence/schemas/evidence";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import type { ApplicationOverrideItem } from "../schemas/overrides";
import { OverridesRepository } from "./overrides-repository";

/**
 * Per-application overrides (guided interview spec): each sensitive item's
 * choice is the general rule; for one application the user can keep,
 * generalize or exclude it instead, before generating.
 */
export class OverridesService {
  constructor(private readonly db: DbClient) {}

  async list(input: {
    userId: string;
    openingId: string;
  }): Promise<ApplicationOverrideItem[]> {
    const profileId = await this.requireOpening(input);
    const cipher = await getUserCipher(this.db, input.userId);
    const open = (value: string | null) =>
      value ? cipher.decrypt(value) : null;
    const items = await new EvidenceRepository(this.db).listSensitiveItems(
      profileId
    );
    const overrides = await new OverridesRepository(this.db).list(
      input.openingId
    );
    return items.map((item) => {
      const override = overrides.find((row) => row.sensitiveItemId === item.id);
      return {
        sensitiveItemId: item.id,
        kind: item.kind,
        original: cipher.decrypt(item.encryptedOriginal),
        choice: item.choice,
        generalized: open(item.encryptedGeneralized),
        override: override
          ? {
              choice: override.choice,
              generalized: open(override.encryptedGeneralized),
            }
          : null,
      };
    });
  }

  async set(input: {
    userId: string;
    openingId: string;
    sensitiveItemId: string;
    choice: SensitivityChoice;
    generalized?: string;
  }) {
    const profileId = await this.requireOpening(input);
    const items = await new EvidenceRepository(this.db).listSensitiveItems(
      profileId
    );
    const item = items.find((row) => row.id === input.sensitiveItemId);
    if (!item) throw new TRPCError({ code: "NOT_FOUND" });
    const generalized = input.generalized?.trim();
    // Generalizing needs a wording: the item's own, or one given here.
    if (
      input.choice === "generalize" &&
      !generalized &&
      !item.encryptedGeneralized
    ) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    const cipher = await getUserCipher(this.db, input.userId);
    await new OverridesRepository(this.db).upsert({
      profileId,
      openingId: input.openingId,
      sensitiveItemId: item.id,
      choice: input.choice,
      encryptedGeneralized:
        input.choice === "generalize" && generalized
          ? cipher.encrypt(generalized)
          : null,
    });
  }

  async remove(input: {
    userId: string;
    openingId: string;
    sensitiveItemId: string;
  }) {
    await this.requireOpening(input);
    await new OverridesRepository(this.db).remove(input);
  }

  private async requireOpening(input: { userId: string; openingId: string }) {
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      input.userId
    );
    const opening =
      profile &&
      (await new OpeningsRepository(this.db).findOpening({
        profileId: profile.id,
        openingId: input.openingId,
      }));
    if (!profile || !opening) throw new TRPCError({ code: "NOT_FOUND" });
    return profile.id;
  }
}
