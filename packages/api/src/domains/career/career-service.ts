import { TRPCError } from "@trpc/server";

import { importSettings } from "@repo/api/domains/profile/import/import-settings";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { ProfileRepository } from "@repo/api/domains/profile/profile-repository";

import { CareerRepository } from "./career-repository";
import type { InterviewLanguage, StartPath } from "./schemas/career";
import type { Timeline } from "./schemas/timeline";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

/**
 * The career profile anchor for one user: the profile and its sources. Every change goes through
 * here, which checks ownership and keeps all career text encrypted.
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
    const [hasStarted, hasProfileDocument, hasOpening] = await Promise.all([
      repository.hasStarted(profile.id),
      new ProfileRepository(this.db).hasDocument(userId),
      repository.hasOpening(profile.id),
    ]);
    return {
      path: profile.startPath,
      hasStarted: hasStarted || hasProfileDocument,
      hasOpening,
    };
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

  /** My career until the profile editor (P1): the profile and its sources. */
  async getTimeline(input: {
    userId: string;
    defaultLanguage: InterviewLanguage;
  }): Promise<Timeline> {
    // A run that crashed is failed first, so the page stops waiting.
    await this.tasks.failCrashed(input.userId);
    const profile = await this.getOrCreateProfile(input);
    const cipher = await getUserCipher(this.db, input.userId);
    const documents = await new CareerRepository(this.db).listDocuments(
      profile.id
    );
    const tasks = new TasksRepository(this.db);
    return {
      profile: {
        interviewLanguage: profile.interviewLanguage,
        privacyNoticeAccepted: !!profile.privacyNoticeAcceptedAt,
      },
      documents: await Promise.all(
        documents.map(async (row) => {
          // An import whose run died leaves its row importing: past its
          // task's life it counts as failed, so nothing waits on it forever.
          const importing =
            row.importStatus === "importing" &&
            (Date.now() - (row.updatedAt ?? row.createdAt).getTime() <
              importSettings.startingGraceMs ||
              !!(await tasks.activeTask(
                row.id,
                "import_document",
                importSettings.staleAfterMs
              )));
          return {
            id: row.id,
            kind: row.kind,
            fileName: cipher.decrypt(row.encryptedFileName),
            createdAt: row.createdAt,
            importStatus:
              row.importStatus === "importing" && !importing
                ? ("failed" as const)
                : row.importStatus,
            importRejection: row.importRejection,
            importProgress: importing
              ? await tasks.latestProgress(row.id, "import_document")
              : null,
            summaryPending:
              row.importStatus === "imported" &&
              !!row.encryptedImportSummary &&
              !row.importSummarySaidAt,
          };
        })
      ),
    };
  }
}
