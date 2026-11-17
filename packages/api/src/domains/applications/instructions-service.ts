import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import { InstructionsRepository } from "./instructions-repository";
import { loadPendingGapAnswers } from "./load-gap-answers";
import {
  type ApplicationInstructions,
  flaggedSensitiveItemSchema,
  positionFieldOf,
} from "./schemas/instructions";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

const sensitiveItemsOf = (cipher: UserCipher, encrypted: string | null) =>
  encrypted
    ? z
        .array(flaggedSensitiveItemSchema)
        .parse(JSON.parse(cipher.decrypt(encrypted)))
    : [];

/**
 * Application instructions (resume spec, "Application instructions"):
 * what the user states for one application, split into points they keep
 * here, and the locked-fact overrides they confirm for this application
 * only.
 */
export class InstructionsService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db)
  ) {}

  private async requireOpening(userId: string, openingId: string) {
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      userId
    );
    const opening =
      profile &&
      (await new OpeningsRepository(this.db).findOpening({
        profileId: profile.id,
        openingId,
      }));
    if (!profile || !opening) throw notFound();
    return { profile, opening };
  }

  async get(input: {
    userId: string;
    openingId: string;
  }): Promise<ApplicationInstructions> {
    const { profile, opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    return this.db.transaction(async (tx) => {
      const repository = new InstructionsRepository(tx);
      const cipher = await getUserCipher(tx, input.userId);
      const latest = await repository.latestInstructions(opening.id);
      const positions = new Map(
        (await new CareerRepository(tx).listPositions(profile.id)).map(
          (position) => [
            position.id,
            {
              employer: cipher.decrypt(position.encryptedEmployer),
              title: cipher.decrypt(position.encryptedTitle),
              startDate: position.startDate,
              endDate: position.endDate,
            },
          ]
        )
      );

      return {
        splitting: latest?.status === "splitting",
        failed: latest?.status === "failed",
        points: (await repository.listPoints(opening.id))
          .filter((point) => point.status !== "removed")
          .map((point) => ({
            id: point.id,
            status: point.status,
            source: point.source,
            text: cipher.decrypt(point.encryptedText),
            suggestedPromotion: point.suggestedPromotion,
            positionId: point.positionId,
            credentialId: point.credentialId,
            evidenceKind: point.evidenceKind,
            sensitiveItems: sensitiveItemsOf(
              cipher,
              point.encryptedSensitiveItems
            ),
          })),
        overrides: (await repository.listOverrides(opening.id)).map((row) => ({
          id: row.id,
          instructionPointId: row.instructionPointId,
          positionId: row.positionId,
          employer: positions.get(row.positionId)!.employer,
          field: row.field,
          original: positions.get(row.positionId)![positionFieldOf[row.field]],
          value: cipher.decrypt(row.encryptedValue),
          confirmed: !!row.confirmedAt,
        })),
        pendingGapAnswers: (
          await loadPendingGapAnswers({ db: tx, cipher, openingId: opening.id })
        ).length,
      };
    });
  }

  /**
   * Splits what the user wrote, plus the answers to gap questions, into
   * points in a task. Drafts left from an earlier split are replaced.
   */
  async split(input: {
    userId: string;
    openingId: string;
    text: string;
  }): Promise<{ realtime: RealtimeSubscription }> {
    const { profile, opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "split_instructions",
    });
    const instructions = await this.db.transaction(async (tx) => {
      const repository = new InstructionsRepository(tx);
      const latest = await repository.latestInstructions(opening.id);
      if (latest?.status === "splitting") {
        throw new TRPCError({ code: "CONFLICT" });
      }
      await this.discardDrafts(repository, opening.id);
      const cipher = await getUserCipher(tx, input.userId);
      const text = input.text.trim();
      const gapAnswers = await loadPendingGapAnswers({
        db: tx,
        cipher,
        openingId: opening.id,
      });
      if (!text && gapAnswers.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      return repository.insertInstructions({
        profileId: profile.id,
        openingId: opening.id,
        encryptedText: cipher.encrypt(text),
      });
    });
    const { realtime } = await this.tasks.startOrUndo(
      {
        userId: input.userId,
        type: "split_instructions",
        subjectId: instructions.id,
      },
      () =>
        new InstructionsRepository(this.db).updateInstructions(
          instructions.id,
          {
            status: "failed",
          }
        )
    );
    return { realtime };
  }

  private async discardDrafts(
    repository: InstructionsRepository,
    openingId: string
  ) {
    await repository.deletePoints(
      (await repository.listPoints(openingId))
        .filter((point) => point.status === "draft")
        .map((point) => point.id)
    );
    await repository.deleteOverrides(
      (await repository.listOverrides(openingId))
        .filter((row) => !row.confirmedAt)
        .map((row) => row.id)
    );
  }

  /**
   * The user's review of the drafts: every point stays in this application
   * (promoting one to the career is gone with the evidence base). Overrides
   * not confirmed are dropped.
   */
  async confirm(input: {
    userId: string;
    openingId: string;
    confirmedLockedFactOverrideIds: string[];
  }) {
    const { opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    await this.db.transaction(async (tx) => {
      const repository = new InstructionsRepository(tx);
      const confirmedAt = new Date();
      const pending = (await repository.listOverrides(opening.id)).filter(
        (row) => !row.confirmedAt
      );

      // Profile_truth replaces this in P8 (docs/plan.md): "send to my
      // profile" will turn a point into a profile suggestion.
      // Locked: a second submit finds no drafts left.
      for (const point of await repository.lockDraftPoints(opening.id)) {
        await repository.updatePoint(point.id, { status: "kept", confirmedAt });
      }

      const confirmed = new Set(input.confirmedLockedFactOverrideIds);
      await repository.confirmOverrides(
        pending.filter((row) => confirmed.has(row.id)).map((row) => row.id),
        confirmedAt
      );
      await repository.deleteOverrides(
        pending.filter((row) => !confirmed.has(row.id)).map((row) => row.id)
      );
    });
  }

  /**
   * Removes a kept point from this application, with the overrides it
   * asked for.
   */
  async removePoint(input: {
    userId: string;
    openingId: string;
    instructionPointId: string;
  }) {
    const { opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    await this.db.transaction(async (tx) => {
      const repository = new InstructionsRepository(tx);
      const point = (await repository.listPoints(opening.id)).find(
        (row) => row.id === input.instructionPointId
      );
      if (!point || point.status === "removed") throw notFound();
      await repository.updatePoint(point.id, { status: "removed" });
      await repository.deleteOverrides(
        (await repository.listOverrides(opening.id))
          .filter((row) => row.instructionPointId === point.id)
          .map((row) => row.id)
      );
    });
  }

  async removeOverride(input: {
    userId: string;
    openingId: string;
    lockedFactOverrideId: string;
  }) {
    const { opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    await this.db.transaction(async (tx) => {
      const repository = new InstructionsRepository(tx);
      const overrides = await repository.listOverrides(opening.id);
      if (!overrides.some((row) => row.id === input.lockedFactOverrideId)) {
        throw notFound();
      }
      await repository.deleteOverrides([input.lockedFactOverrideId]);
    });
  }
}
