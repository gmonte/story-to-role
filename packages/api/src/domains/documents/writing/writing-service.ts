import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import type { GenerationSettings } from "../schemas/generation-settings";
import type { StyleProfile, TemplateSection } from "../schemas/template";
import { loadWritingSetup, type WritingSetup } from "./load-writing-setup";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

/** The user's global template, resume header and style profile. */
export class WritingService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db)
  ) {}

  private async requireProfile(userId: string) {
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      userId
    );
    if (!profile) throw notFound();
    return profile;
  }

  async get(userId: string): Promise<WritingSetup> {
    // A run that crashed is failed first, so the page stops waiting.
    await this.tasks.failCrashed(userId);
    await this.requireProfile(userId);
    return this.db.transaction(async (tx) =>
      loadWritingSetup({
        db: tx,
        cipher: await getUserCipher(tx, userId),
        userId,
      })
    );
  }

  /** Saves the template's sections. */
  async updateTemplate(input: { userId: string; sections: TemplateSection[] }) {
    const profile = await this.requireProfile(input.userId);
    const kinds = new Set(input.sections.map((section) => section.kind));
    if (kinds.size !== input.sections.length) {
      throw new TRPCError({ code: "BAD_REQUEST" });
    }
    await new DocumentsRepository(this.db).upsertTemplate({
      profileId: profile.id,
      sections: input.sections,
    });
  }

  /** The defaults every generation form starts from. */
  async updateGenerationSettings(input: {
    userId: string;
    settings: GenerationSettings;
  }) {
    const profile = await this.requireProfile(input.userId);
    await new DocumentsRepository(this.db).saveGenerationSettings({
      profileId: profile.id,
      generationSettings: input.settings,
    });
  }

  /** Stores the samples and extracts a profile from them in a task. */
  async extractStyle(input: {
    userId: string;
    samples: string[];
  }): Promise<{ realtime: RealtimeSubscription }> {
    const profile = await this.requireProfile(input.userId);
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "extract_style_profile",
    });
    await this.db.transaction(async (tx) => {
      const cipher = await getUserCipher(tx, input.userId);
      await new DocumentsRepository(tx).saveStyleSamples({
        profileId: profile.id,
        encryptedSamples: cipher.encrypt(
          JSON.stringify(
            input.samples.map((sample) => sample.trim()).filter(Boolean)
          )
        ),
      });
    });
    const { realtime } = await this.tasks.start({
      userId: input.userId,
      type: "extract_style_profile",
      subjectId: profile.id,
    });
    return { realtime };
  }

  /** The user's reviewed profile; from now on every generation uses it. */
  async approveStyle(input: { userId: string; style: StyleProfile }) {
    const profile = await this.requireProfile(input.userId);
    await this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      if (!(await repository.findStyleProfile(profile.id))) throw notFound();
      const cipher = await getUserCipher(tx, input.userId);
      await repository.setStyleProfile({
        profileId: profile.id,
        encryptedProfile: cipher.encrypt(JSON.stringify(input.style)),
        approvedAt: new Date(),
      });
    });
  }
}
