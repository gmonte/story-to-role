import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { DbClient } from "@repo/api/tools/db-client";
import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import { EvidenceRepository } from "@repo/api/domains/evidence/evidence-repository";
import { InterviewRepository } from "@repo/api/domains/interview/interview-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { interviewStages } from "@repo/api/domains/interview/schemas/interview";

import { CareerRepository } from "./career-repository";
import { computeDepth } from "./depth";
import {
  yearMonthSchema,
  type InterviewLanguage,
  type ConflictField,
  type TimelineProposalKind,
  type StartPath,
} from "./schemas/career";
import {
  positionInputSchema,
  type CredentialInput,
  type CredentialView,
  type PositionInput,
  type PositionView,
  type Timeline,
  type TimelineProposalView,
} from "./schemas/timeline";
import {
  mergeImportedPositions,
  type ImportedPosition,
} from "./timeline/merge-imported-positions";

type PositionRow = Awaited<
  ReturnType<CareerRepository["listPositions"]>
>[number];

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

/** Decrypts an optional column. */
function open(cipher: UserCipher, value: string | null | undefined) {
  return value ? cipher.decrypt(value) : null;
}

function seal(cipher: UserCipher, value: string | null | undefined) {
  return value ? cipher.encrypt(value) : null;
}

/**
 * The evidence base's skeleton for one user: profile, timeline of positions,
 * credentials and imported documents. Every change goes through here, which
 * checks ownership (rows are looked up by the user's profile) and keeps all
 * career text encrypted.
 */
export class CareerService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db)
  ) {}

  /** The profile is created on first use, in the interface language. */
  async getOrCreateProfile(input: {
    userId: string;
    defaultLanguage: InterviewLanguage;
  }) {
    const repository = new CareerRepository(this.db);
    let profile = await repository.findProfileByUserId(input.userId);
    if (!profile) {
      await repository.insertProfileIfMissing({
        userId: input.userId,
        interviewLanguage: input.defaultLanguage,
      });
      profile = await repository.findProfileByUserId(input.userId);
    }
    if (!profile) throw new Error("The career profile could not be created");
    return profile;
  }

  async requireProfile(userId: string) {
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      userId
    );
    if (!profile) throw notFound();
    return profile;
  }

  async updateSettings(input: {
    userId: string;
    interviewLanguage: InterviewLanguage;
  }) {
    const profile = await this.requireProfile(input.userId);
    await new CareerRepository(this.db).updateProfile(profile.id, {
      interviewLanguage: input.interviewLanguage,
    });
  }

  /**
   * Where the user stands at the start (workspace spec, "Onboarding"): the
   * path they chose, and whether they already have anything (someone who
   * does skips the choice). Read-only: the profile comes with the choice.
   */
  async startState(userId: string) {
    const repository = new CareerRepository(this.db);
    const profile = await repository.findProfileByUserId(userId);
    if (!profile) return { path: null, hasStarted: false, hasOpening: false };
    const [hasStarted, hasOpening] = await Promise.all([
      repository.hasStarted(profile.id),
      repository.hasOpening(profile.id),
    ]);
    return { path: profile.startPath, hasStarted, hasOpening };
  }

  async chooseStart(input: {
    userId: string;
    defaultLanguage: InterviewLanguage;
    path: StartPath;
  }) {
    const profile = await this.getOrCreateProfile(input);
    await new CareerRepository(this.db).updateProfile(profile.id, {
      startPath: input.path,
    });
  }

  async acceptPrivacyNotice(userId: string) {
    const profile = await this.requireProfile(userId);
    await new CareerRepository(this.db).updateProfile(profile.id, {
      privacyNoticeAcceptedAt: new Date(),
    });
  }

  async getTimeline(input: {
    userId: string;
    defaultLanguage: InterviewLanguage;
  }): Promise<Timeline> {
    const profile = await this.getOrCreateProfile(input);

    return this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const evidence = new EvidenceRepository(tx);
      const cipher = await getUserCipher(tx, input.userId);

      const positionRows = await career.listPositions(profile.id);
      const [conflicts, evidenceRows, stories, sensitiveItems, sessions] =
        await Promise.all([
          career.listOpenConflicts(positionRows.map((row) => row.id)),
          evidence.listEvidence(profile.id),
          evidence.listStories(profile.id),
          evidence.listSensitiveItems(profile.id),
          new InterviewRepository(tx).listSessions(profile.id),
        ]);

      const contextStage = interviewStages.indexOf("projects");

      const toView = (row: PositionRow): PositionView => {
        const ownEvidence = evidenceRows.filter((e) => e.positionId === row.id);
        return {
          id: row.id,
          employer: cipher.decrypt(row.encryptedEmployer),
          title: cipher.decrypt(row.encryptedTitle),
          location: open(cipher, row.encryptedLocation),
          startDate: row.startDate,
          endDate: row.endDate,
          status: row.status,
          origin: row.origin,
          scriptKind: row.scriptKind,
          conflicts: conflicts
            .filter((conflict) => conflict.positionId === row.id)
            .map((conflict) => ({
              id: conflict.id,
              field: conflict.field,
              options: JSON.parse(
                cipher.decrypt(conflict.encryptedOptions)
              ) as string[],
            })),
          depth: computeDepth({
            hasDates: !!row.startDate,
            scriptKind: row.scriptKind,
            approved: row.status === "approved",
            reachedContext: sessions.some(
              (session) =>
                session.positionId === row.id &&
                interviewStages.indexOf(session.stage) >= contextStage
            ),
            storyCount: stories.filter((s) => s.positionId === row.id).length,
            achievements: ownEvidence
              .filter((e) => e.kind === "achievement" || e.kind === "metric")
              .map((e) => cipher.decrypt(e.encryptedText)),
            toolCount: ownEvidence.filter((e) => e.kind === "tool").length,
            sensitivePending: sensitiveItems.filter(
              (item) => item.positionId === row.id && !item.reviewedAt
            ).length,
          }),
          languages: [...new Set(ownEvidence.map((e) => e.language))],
        };
      };

      // Most recent first: the order the interview goes through them.
      const byRecency = (a: PositionRow, b: PositionRow) =>
        (b.endDate ?? "9999-12").localeCompare(a.endDate ?? "9999-12") ||
        (b.startDate ?? "").localeCompare(a.startDate ?? "");
      const sorted = [...positionRows].sort(byRecency);

      const narrative = await career.latestNarrative(profile.id);

      return {
        evidenceLanguages: [
          ...new Set(evidenceRows.map((row) => row.language)),
        ],
        narrative: narrative
          ? {
              id: narrative.id,
              text: cipher.decrypt(narrative.encryptedText),
              themes: JSON.parse(
                cipher.decrypt(narrative.encryptedThemes)
              ) as string[],
              approved: !!narrative.approvedAt,
            }
          : null,
        profile: {
          interviewLanguage: profile.interviewLanguage,
          privacyNoticeAccepted: !!profile.privacyNoticeAcceptedAt,
        },
        positions: sorted.filter((r) => r.status !== "removed").map(toView),
        removedPositions: sorted
          .filter((r) => r.status === "removed")
          .map(toView),
        credentials: (await career.listCredentials(profile.id)).map(
          (row): CredentialView => ({
            id: row.id,
            kind: row.kind,
            institution: open(cipher, row.encryptedInstitution),
            title: cipher.decrypt(row.encryptedTitle),
            level: row.level,
            startDate: row.startDate,
            endDate: row.endDate,
            status: row.status,
            approved: !!row.approvedAt,
            depth: (() => {
              const own = evidenceRows.filter((e) => e.credentialId === row.id);
              const storyCount = stories.filter(
                (s) => s.credentialId === row.id
              ).length;
              return computeDepth({
                hasDates: true,
                scriptKind: "short",
                approved: !!row.approvedAt,
                reachedContext: storyCount > 0 || own.length > 0,
                storyCount,
                achievements: own
                  .filter(
                    (e) => e.kind === "achievement" || e.kind === "metric"
                  )
                  .map((e) => cipher.decrypt(e.encryptedText)),
                toolCount: own.filter((e) => e.kind === "tool").length,
                sensitivePending: 0,
              });
            })(),
          })
        ),
        documents: (await career.listDocuments(profile.id)).map((row) => ({
          id: row.id,
          kind: row.kind,
          fileName: cipher.decrypt(row.encryptedFileName),
          status: row.status,
          rejectionReason: row.rejectionReason,
          createdAt: row.createdAt,
        })),
        proposals: (await career.listPendingProposals(profile.id)).map(
          (row): TimelineProposalView => ({
            id: row.id,
            kind: row.kind,
            payload: JSON.parse(cipher.decrypt(row.encryptedPayload)) as Record<
              string,
              unknown
            >,
            createdAt: row.createdAt,
          })
        ),
      };
    });
  }

  /** Drafts the links between approved positions, in a task. */
  async requestNarrative(userId: string) {
    const profile = await this.requireProfile(userId);
    const positions = await new CareerRepository(this.db).listPositions(
      profile.id
    );
    if (!positions.some((position) => position.status === "approved")) {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }
    const { realtime } = await this.tasks.start({
      userId,
      type: "draft_narrative",
    });
    return { realtime };
  }

  async approveNarrative(input: { userId: string; narrativeId: string }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const narrative = await career.latestNarrative(profile.id);
      if (narrative?.id !== input.narrativeId) throw notFound();
      await career.approveNarrative(narrative.id);
    });
  }

  async addPosition(input: { userId: string; position: PositionInput }) {
    const profile = await this.requireProfile(input.userId);
    return this.db.transaction(async (tx) => {
      const cipher = await getUserCipher(tx, input.userId);
      const row = await new CareerRepository(tx).insertPosition({
        profileId: profile.id,
        origin: "manual",
        ...this.sealPosition(cipher, input.position),
      });
      return { positionId: row.id };
    });
  }

  /** The user owns their facts: editing even an approved position is allowed. */
  async updatePosition(input: {
    userId: string;
    positionId: string;
    position: PositionInput;
  }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const row = await career.findPosition({
        profileId: profile.id,
        positionId: input.positionId,
      });
      if (!row) throw notFound();
      const cipher = await getUserCipher(tx, input.userId);
      await career.updatePosition(
        row.id,
        this.sealPosition(cipher, input.position)
      );
    });
  }

  /** Soft removal: the position and its evidence stay, hidden, for restore. */
  async removePosition(input: { userId: string; positionId: string }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const row = await career.findPosition({
        profileId: profile.id,
        positionId: input.positionId,
      });
      if (!row) throw notFound();
      await career.updatePosition(row.id, {
        status: "removed",
        removedAt: new Date(),
      });
    });
  }

  async restorePosition(input: { userId: string; positionId: string }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const row = await career.findPosition({
        profileId: profile.id,
        positionId: input.positionId,
      });
      if (row?.status !== "removed") throw notFound();
      await career.updatePosition(row.id, {
        status: row.approvedAt ? "approved" : "pending",
        removedAt: null,
      });
    });
  }

  /**
   * Joins two entries for the same position: everything the first owns
   * (evidence, stories, sessions, conflicts, sources) moves to the second.
   */
  async mergePositions(input: {
    userId: string;
    positionId: string;
    intoPositionId: string;
  }) {
    if (input.positionId === input.intoPositionId) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const [from, into] = await Promise.all([
        career.findPosition({
          profileId: profile.id,
          positionId: input.positionId,
        }),
        career.findPosition({
          profileId: profile.id,
          positionId: input.intoPositionId,
        }),
      ]);
      if (!from || !into) throw notFound();

      const move = { fromPositionId: from.id, toPositionId: into.id };
      await new EvidenceRepository(tx).movePositionContent(move);
      await new InterviewRepository(tx).moveSessions(move);
      await career.moveConflicts(move);
      await career.updatePosition(into.id, {
        sourceDocumentIds: [
          ...new Set([...into.sourceDocumentIds, ...from.sourceDocumentIds]),
        ],
      });
      await career.deletePosition(from.id);
    });
  }

  async resolveConflict(input: {
    userId: string;
    positionConflictId: string;
    value: string;
  }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const conflict = await career.findConflict(input.positionConflictId);
      const position =
        conflict &&
        (await career.findPosition({
          profileId: profile.id,
          positionId: conflict.positionId,
        }));
      if (!conflict || !position) throw notFound();

      const cipher = await getUserCipher(tx, input.userId);
      const options = JSON.parse(
        cipher.decrypt(conflict.encryptedOptions)
      ) as string[];
      if (!options.includes(input.value)) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      const changes: Record<ConflictField, () => object> = {
        title: () => ({ encryptedTitle: cipher.encrypt(input.value) }),
        startDate: () => ({ startDate: input.value }),
        endDate: () => ({
          endDate: input.value === "current" ? null : input.value,
        }),
      };
      await career.updatePosition(position.id, changes[conflict.field]());
      await career.resolveConflict(conflict.id);
    });
  }

  /**
   * Joins positions found in an imported file to the timeline (the same
   * position becomes one entry, disagreements become conflicts). Runs inside
   * the import task's transaction. Returns the ids of the touched positions.
   */
  async applyImportedPositions(input: {
    tx: DbClient;
    cipher: UserCipher;
    profileId: string;
    sourceDocumentId: string;
    origin: "imported" | "truth_file";
    imported: ImportedPosition[];
  }) {
    const career = new CareerRepository(input.tx);
    const rows = (await career.listPositions(input.profileId)).filter(
      (row) => row.status !== "removed"
    );
    const plan = mergeImportedPositions(
      rows.map((row) => ({
        id: row.id,
        employer: input.cipher.decrypt(row.encryptedEmployer),
        title: input.cipher.decrypt(row.encryptedTitle),
        location: open(input.cipher, row.encryptedLocation) ?? undefined,
        startDate: row.startDate ?? undefined,
        endDate: row.endDate ?? undefined,
      })),
      input.imported
    );

    const touched: Array<{ positionId: string; imported: ImportedPosition }> =
      [];

    for (const position of plan.creates) {
      const row = await career.insertPosition({
        profileId: input.profileId,
        origin: input.origin,
        sourceDocumentIds: [input.sourceDocumentId],
        ...this.sealPosition(input.cipher, position),
      });
      touched.push({ positionId: row.id, imported: position });
    }

    // One open conflict per field: options from every source join it.
    const openConflicts = await career.listOpenConflicts(
      plan.updates.map((update) => update.positionId)
    );
    const planned = new Map<string, Set<string>>();

    for (const update of plan.updates) {
      const row = rows.find((r) => r.id === update.positionId);
      if (!row) continue;
      await career.updatePosition(row.id, {
        sourceDocumentIds: [
          ...new Set([...row.sourceDocumentIds, input.sourceDocumentId]),
        ],
        ...(update.fill.location
          ? { encryptedLocation: input.cipher.encrypt(update.fill.location) }
          : {}),
      });
      for (const conflict of update.conflicts) {
        const key = `${row.id}:${conflict.field}`;
        const existing = openConflicts.find(
          (open) => open.positionId === row.id && open.field === conflict.field
        );
        const options = new Set([
          ...(existing
            ? (JSON.parse(
                input.cipher.decrypt(existing.encryptedOptions)
              ) as string[])
            : []),
          ...(planned.get(key) ?? []),
          ...conflict.options,
        ]);
        planned.set(key, options);
        if (existing) {
          await career.updateConflictOptions({
            positionConflictId: existing.id,
            encryptedOptions: input.cipher.encrypt(
              JSON.stringify([...options])
            ),
          });
        }
      }
      touched.push({ positionId: row.id, imported: update.imported });
    }

    await career.insertConflicts(
      [...planned.entries()]
        .filter(([key]) => {
          const [positionId, field] = key.split(":");
          return !openConflicts.some(
            (open) => open.positionId === positionId && open.field === field
          );
        })
        .map(([key, options]) => {
          const [positionId, field] = key.split(":");
          return {
            positionId,
            field: field as ConflictField,
            encryptedOptions: input.cipher.encrypt(
              JSON.stringify([...options])
            ),
          };
        })
    );

    return touched;
  }

  async addCredential(input: { userId: string; credential: CredentialInput }) {
    const profile = await this.requireProfile(input.userId);
    return this.db.transaction(async (tx) => {
      const cipher = await getUserCipher(tx, input.userId);
      const row = await new CareerRepository(tx).insertCredential({
        profileId: profile.id,
        ...this.sealCredential(cipher, input.credential),
        // Added by hand: the user is the source, so it is approved already.
        approvedAt: new Date(),
      });
      return { credentialId: row.id };
    });
  }

  async updateCredential(input: {
    userId: string;
    credentialId: string;
    credential: CredentialInput;
  }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const row = await career.findCredential({
        profileId: profile.id,
        credentialId: input.credentialId,
      });
      if (!row) throw notFound();
      const cipher = await getUserCipher(tx, input.userId);
      await career.updateCredential(row.id, {
        ...this.sealCredential(cipher, input.credential),
        approvedAt: row.approvedAt ?? new Date(),
      });
    });
  }

  async approveCredential(input: { userId: string; credentialId: string }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const row = await career.findCredential({
        profileId: profile.id,
        credentialId: input.credentialId,
      });
      if (!row) throw notFound();
      await career.updateCredential(row.id, { approvedAt: new Date() });
    });
  }

  async removeCredential(input: { userId: string; credentialId: string }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const row = await career.findCredential({
        profileId: profile.id,
        credentialId: input.credentialId,
      });
      if (!row) throw notFound();
      await career.deleteCredential(row.id);
    });
  }

  /**
   * Applies a change the interviewer proposed, now that the user confirmed
   * it. Marking the proposal and applying the change commit together.
   */
  async acceptProposal(input: { userId: string; timelineProposalId: string }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const row = await career.findProposal({
        profileId: profile.id,
        timelineProposalId: input.timelineProposalId,
      });
      if (!row || row.acceptedAt || row.rejectedAt) throw notFound();
      const cipher = await getUserCipher(tx, input.userId);
      const parsed = proposalPayloadSchemas[row.kind].safeParse(
        JSON.parse(cipher.decrypt(row.encryptedPayload))
      );
      if (!parsed.success) throw notFound();

      await career.decideProposal({
        timelineProposalId: row.id,
        accepted: true,
      });
      // The same operations as the user's own actions, inside this transaction.
      const service = new CareerService(tx, this.tasks);
      const userId = input.userId;
      const payload = parsed.data as Record<string, string | undefined>;
      switch (row.kind) {
        case "update_position":
          return service.applyPositionCorrection({
            userId,
            positionId: payload.positionId!,
            correction: payload,
          });
        case "add_position": {
          const { positionId } = await service.addPosition({
            userId,
            position: payloadToPosition(payload),
          });
          return career.updatePosition(positionId, { origin: "interview" });
        }
        case "remove_position":
          return service.removePosition({
            userId,
            positionId: payload.positionId!,
          });
        case "resolve_conflict":
          return service.resolveConflict({
            userId,
            positionConflictId: payload.positionConflictId!,
            value: payload.value!,
          });
        case "merge_positions":
          return service.mergePositions({
            userId,
            positionId: payload.positionId!,
            intoPositionId: payload.intoPositionId!,
          });
        case "split_position":
          return service.splitPosition({
            userId,
            positionId: payload.positionId!,
            title: payload.title!,
            startDate: payload.startDate!,
          });
      }
    });
  }

  async rejectProposal(input: { userId: string; timelineProposalId: string }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const row = await career.findProposal({
        profileId: profile.id,
        timelineProposalId: input.timelineProposalId,
      });
      if (!row || row.acceptedAt || row.rejectedAt) throw notFound();
      await career.decideProposal({
        timelineProposalId: row.id,
        accepted: false,
      });
    });
  }

  /** Applies the facts the user corrected during the interview. */
  async applyPositionCorrection(input: {
    userId: string;
    positionId: string;
    correction: Record<string, string | undefined>;
  }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const row = await career.findPosition({
        profileId: profile.id,
        positionId: input.positionId,
      });
      if (!row) throw notFound();
      const cipher = await getUserCipher(tx, input.userId);
      const { employer, title, startDate, endDate, location } =
        input.correction;
      await career.updatePosition(row.id, {
        ...(employer ? { encryptedEmployer: cipher.encrypt(employer) } : {}),
        ...(title ? { encryptedTitle: cipher.encrypt(title) } : {}),
        ...(location ? { encryptedLocation: cipher.encrypt(location) } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate: endDate === "current" ? null : endDate } : {}),
      });
    });
  }

  /**
   * A promotion with a new scope becomes its own entry: the new position
   * starts at `startDate` and the original ends the month before.
   */
  async splitPosition(input: {
    userId: string;
    positionId: string;
    title: string;
    startDate: string;
  }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const row = await career.findPosition({
        profileId: profile.id,
        positionId: input.positionId,
      });
      if (!row) throw notFound();
      const cipher = await getUserCipher(tx, input.userId);
      await career.insertPosition({
        profileId: profile.id,
        origin: "interview",
        encryptedEmployer: row.encryptedEmployer,
        encryptedTitle: cipher.encrypt(input.title),
        encryptedLocation: row.encryptedLocation,
        startDate: input.startDate,
        endDate: row.endDate,
        sourceDocumentIds: row.sourceDocumentIds,
      });
      await career.updatePosition(row.id, {
        endDate: previousMonth(input.startDate),
      });
    });
  }

  private sealPosition(cipher: UserCipher, position: PositionInput) {
    return {
      encryptedEmployer: cipher.encrypt(position.employer),
      encryptedTitle: cipher.encrypt(position.title),
      encryptedLocation: seal(cipher, position.location),
      startDate: position.startDate ?? null,
      endDate: position.endDate ?? null,
    };
  }

  private sealCredential(cipher: UserCipher, credential: CredentialInput) {
    return {
      kind: credential.kind,
      encryptedInstitution: seal(cipher, credential.institution),
      encryptedTitle: cipher.encrypt(credential.title),
      level: credential.level ?? null,
      startDate: credential.startDate ?? null,
      endDate: credential.endDate ?? null,
      status: credential.status,
    };
  }
}

const optionalText = z.string().trim().min(1).max(200).optional();

/** What each kind of proposal carries, checked before it is applied. */
const proposalPayloadSchemas: Record<TimelineProposalKind, z.ZodObject> = {
  update_position: z.object({
    positionId: z.uuid(),
    employer: optionalText,
    title: optionalText,
    startDate: yearMonthSchema.optional(),
    endDate: z.union([yearMonthSchema, z.literal("current")]).optional(),
    location: optionalText,
  }),
  add_position: positionInputSchema,
  remove_position: z.object({ positionId: z.uuid() }),
  resolve_conflict: z.object({
    positionId: z.uuid(),
    positionConflictId: z.uuid(),
    value: z.string().min(1),
  }),
  merge_positions: z.object({ positionId: z.uuid(), intoPositionId: z.uuid() }),
  split_position: z.object({
    positionId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    startDate: yearMonthSchema,
  }),
};

function payloadToPosition(
  payload: Record<string, string | undefined>
): PositionInput {
  return positionInputSchema.parse(payload);
}

function previousMonth(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
