import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import { EvidenceRepository } from "@repo/api/domains/evidence/evidence-repository";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import { InstructionsRepository } from "./instructions-repository";
import { loadPendingGapAnswers } from "./load-gap-answers";
import {
  type ApplicationInstructions,
  flaggedSensitiveItemSchema,
  type InstructionDecision,
  type LockedField,
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
 * here or promote to the evidence base, and the locked-fact overrides
 * they confirm for this application only.
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
          (position) => [position.id, position]
        )
      );
      const original = (positionId: string, field: LockedField) => {
        const position = positions.get(positionId)!;
        switch (field) {
          case "employer":
            return cipher.decrypt(position.encryptedEmployer);
          case "title":
            return cipher.decrypt(position.encryptedTitle);
          case "start_date":
            return position.startDate;
          case "end_date":
            return position.endDate;
        }
      };

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
          pointId: row.pointId,
          positionId: row.positionId,
          employer: cipher.decrypt(
            positions.get(row.positionId)!.encryptedEmployer
          ),
          field: row.field,
          original: original(row.positionId, row.field),
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
    const { realtime } = await this.tasks.start({
      userId: input.userId,
      type: "split_instructions",
      subjectId: instructions.id,
    });
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
   * The user's review of the drafts: promoted points become evidence with
   * their own words as the quote, through the same approval as interview
   * evidence (flagged names go to the sensitive-data review); the others
   * stay in this application. Overrides not confirmed are dropped.
   */
  async confirm(input: {
    userId: string;
    openingId: string;
    decisions: InstructionDecision[];
    confirmedOverrideIds: string[];
  }) {
    const { profile, opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    await this.db.transaction(async (tx) => {
      const repository = new InstructionsRepository(tx);
      const evidence = new EvidenceRepository(tx);
      const career = new CareerRepository(tx);
      const cipher = await getUserCipher(tx, input.userId);
      const confirmedAt = new Date();
      const positionIds = new Set(
        (await career.listPositions(profile.id))
          .filter((position) => position.status === "approved")
          .map((position) => position.id)
      );
      const credentialIds = new Set(
        (await career.listCredentials(profile.id))
          .filter((credential) => credential.approvedAt)
          .map((credential) => credential.id)
      );
      const decisions = new Map(input.decisions.map((d) => [d.pointId, d]));

      const drafts = (await repository.listPoints(opening.id)).filter(
        (point) => point.status === "draft"
      );
      for (const point of drafts) {
        const decision = decisions.get(point.id);
        const positionId =
          decision?.positionId && positionIds.has(decision.positionId)
            ? decision.positionId
            : null;
        const credentialId =
          !positionId &&
          decision?.credentialId &&
          credentialIds.has(decision.credentialId)
            ? decision.credentialId
            : null;
        if (!decision?.promote) {
          await repository.updatePoint(point.id, {
            status: "kept",
            confirmedAt,
          });
          continue;
        }
        if (!positionId && !credentialId) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }
        const [row] = await evidence.insertEvidence([
          {
            profileId: profile.id,
            positionId,
            credentialId,
            kind: decision.evidenceKind ?? point.evidenceKind ?? "achievement",
            encryptedText: point.encryptedText,
            encryptedSourceQuote: point.encryptedText,
            language: profile.interviewLanguage,
            approvedAt: confirmedAt,
          },
        ]);
        await evidence.insertSensitiveItems(
          sensitiveItemsOf(cipher, point.encryptedSensitiveItems).map(
            (item) => ({
              profileId: profile.id,
              positionId,
              kind: item.kind,
              encryptedOriginal: cipher.encrypt(item.original),
              // Default choice (spec): generalize clients and figures.
              choice:
                item.kind === "client" || item.kind === "figure"
                  ? "generalize"
                  : null,
              encryptedGeneralized: item.suggestedGeneralization
                ? cipher.encrypt(item.suggestedGeneralization)
                : null,
            })
          )
        );
        await repository.updatePoint(point.id, {
          status: "promoted",
          positionId,
          credentialId,
          evidenceId: row.id,
          confirmedAt,
        });
      }

      const confirmed = new Set(input.confirmedOverrideIds);
      const pending = (await repository.listOverrides(opening.id)).filter(
        (row) => !row.confirmedAt
      );
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
   * Removes a point from this application. A promoted point's evidence
   * stays in the evidence base, where the user manages it.
   */
  async removePoint(input: {
    userId: string;
    openingId: string;
    pointId: string;
  }) {
    const { opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    await this.db.transaction(async (tx) => {
      const repository = new InstructionsRepository(tx);
      const points = await repository.listPoints(opening.id);
      if (!points.some((point) => point.id === input.pointId)) {
        throw notFound();
      }
      await repository.updatePoint(input.pointId, { status: "removed" });
    });
  }

  async removeOverride(input: {
    userId: string;
    openingId: string;
    overrideId: string;
  }) {
    const { opening } = await this.requireOpening(
      input.userId,
      input.openingId
    );
    await this.db.transaction(async (tx) => {
      const repository = new InstructionsRepository(tx);
      const overrides = await repository.listOverrides(opening.id);
      if (!overrides.some((row) => row.id === input.overrideId)) {
        throw notFound();
      }
      await repository.deleteOverrides([input.overrideId]);
    });
  }
}
