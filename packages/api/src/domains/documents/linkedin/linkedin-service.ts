import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { Tone } from "@repo/api/domains/openings/schemas/opening";
import type { RealtimeSubscription } from "@repo/api/domains/tasks/schemas/task";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";
import { loadNeverIncludeFilter } from "@repo/api/domains/profile/rules/load-never-include-filter";

import {
  assertSendable,
  FrozenContexts,
} from "../coverage-review/snapshot-coverage";
import { DocumentsRepository } from "../documents-repository";
import { failGeneration } from "../documents-service";
import { freezeGeneration } from "../generation/generation-request";
import { requireUserVersion } from "../require-version";
import type { OutputLanguage, WritingLevel } from "../schemas/document";
import type { GenerationSettings } from "../schemas/generation-settings";
import { decryptDocument } from "../snapshot-content";
import { loadCareerContext } from "../generation/load-career-context";
import { redoableSection, sectionText } from "./linkedin-resume";
import { linkedinSkeleton } from "./run-generate-linkedin";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

// The library lists a LinkedIn document by this name; code, not the user,
// chooses it, since there is one per user.
const linkedinFocus = "LinkedIn";

/**
 * The user's LinkedIn text (resume spec, "LinkedIn"): one document per
 * user, a version per output language, generated from the published
 * profile and copied section by section. Nothing is sent to LinkedIn.
 */
export class LinkedinService {
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

  /**
   * Generates the LinkedIn text in a language: the first time it creates
   * the user's document, and again in a language it already has becomes
   * that version's new snapshot.
   */
  async generate(input: {
    userId: string;
    language: OutputLanguage;
    writingLevel: WritingLevel;
    tone: Tone;
    settings?: Partial<GenerationSettings>;
  }): Promise<{
    documentId: string;
    generationId: string;
    realtime: RealtimeSubscription;
  }> {
    const profile = await this.requireProfile(input.userId);
    const frozen = await freezeGeneration({
      db: this.db,
      cipher: await getUserCipher(this.db, input.userId),
      userId: input.userId,
      profileId: profile.id,
      settings: input.settings,
    });
    const hints = {
      documentKind: "linkedin" as const,
      maximum: input.writingLevel === "maximum",
    };
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "generate_document",
      hints,
    });
    const generation = await this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const cipher = await getUserCipher(tx, input.userId);
      // One LinkedIn document per user: two first requests at once wait for
      // each other instead of creating two.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`linkedin:${profile.id}`}))`
      );
      const existing = (await repository.listLibraryDocuments(profile.id)).find(
        (document) => document.kind === "linkedin"
      );
      const document =
        existing ??
        (await repository.insertDocument({
          profileId: profile.id,
          kind: "linkedin",
          encryptedFocus: cipher.encrypt(linkedinFocus),
        }));
      const version = existing
        ? (await repository.listVersions([document.id])).find(
            (row) => row.language === input.language
          )
        : undefined;
      return repository.insertGeneration({
        profileId: profile.id,
        documentId: document.id,
        versionId: version?.id ?? null,
        profileVersionId: frozen.profileVersionId,
        settings: frozen.settings,
        language: input.language,
        reviewDepth: "quick",
        writingLevel: input.writingLevel,
        tone: input.tone,
      });
    });
    const { realtime } = await this.tasks.startOrUndo(
      {
        userId: input.userId,
        type: "generate_document",
        subjectId: generation.id,
        hints,
      },
      () => failGeneration(this.db, generation.id)
    );
    return {
      documentId: generation.documentId,
      generationId: generation.id,
      realtime,
    };
  }

  /**
   * Starts the guided flow in a language (resume spec, "LinkedIn", "Step
   * by step"): the first time it creates the user's document, and a
   * language the document lacks gets a version holding what code prints,
   * with no AI and no charge. A version that language already has is left
   * as it is. The completed generation it records keeps the language,
   * writing level, tone and settings the steps write with.
   */
  async start(input: {
    userId: string;
    language: OutputLanguage;
    writingLevel: WritingLevel;
    tone: Tone;
    settings?: Partial<GenerationSettings>;
  }): Promise<{ documentId: string; versionId: string }> {
    const profile = await this.requireProfile(input.userId);
    const cipher = await getUserCipher(this.db, input.userId);
    const frozen = await freezeGeneration({
      db: this.db,
      cipher,
      userId: input.userId,
      profileId: profile.id,
      settings: input.settings,
    });
    const filter = await loadNeverIncludeFilter({
      db: this.db,
      cipher,
      profileId: profile.id,
      profileVersionId: frozen.profileVersionId,
    });
    const context = await loadCareerContext({
      db: this.db,
      cipher,
      profileId: profile.id,
      filter,
      profileVersionId: frozen.profileVersionId,
      language: input.language,
    });
    return this.db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`linkedin:${profile.id}`}))`
      );
      const existing = (await repository.listLibraryDocuments(profile.id)).find(
        (document) => document.kind === "linkedin"
      );
      const document =
        existing ??
        (await repository.insertDocument({
          profileId: profile.id,
          kind: "linkedin",
          encryptedFocus: cipher.encrypt(linkedinFocus),
        }));
      const current = existing
        ? (await repository.listVersions([document.id])).find(
            (row) => row.language === input.language
          )
        : undefined;
      if (current) return { documentId: document.id, versionId: current.id };
      const version = await repository.insertVersion({
        documentId: document.id,
        language: input.language,
      });
      const generation = await repository.insertGeneration({
        profileId: profile.id,
        documentId: document.id,
        versionId: version.id,
        profileVersionId: frozen.profileVersionId,
        settings: frozen.settings,
        language: input.language,
        reviewDepth: "quick",
        writingLevel: input.writingLevel,
        tone: input.tone,
      });
      const snapshot = await repository.insertSnapshot({
        versionId: version.id,
        sequence: 1,
        parentSnapshotId: null,
        origin: "generated",
        author: "ai",
        encryptedContent: cipher.encrypt(
          JSON.stringify(linkedinSkeleton(context))
        ),
        generationId: generation.id,
        profileVersionId: frozen.profileVersionId,
      });
      await repository.updateGeneration(generation.id, {
        status: "completed",
        snapshotId: snapshot.id,
        finishedAt: new Date(),
      });
      return { documentId: document.id, versionId: version.id };
    });
  }

  /**
   * Finishes the guided flow (resume spec, "LinkedIn", "Step by step"): the
   * coverage review of the version's latest snapshot as it is, priced as
   * Review again.
   */
  async review(input: {
    userId: string;
    versionId: string;
  }): Promise<{ generationId: string; realtime: RealtimeSubscription }> {
    const { version, document, profile } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    if (document.kind !== "linkedin") throw notFound();
    const repository = new DocumentsRepository(this.db);
    const latest = await repository.latestSnapshot(version.id);
    const written = await repository.latestWrittenGeneration(version.id);
    if (!latest || !written) throw notFound();
    const hints = { documentKind: "linkedin" as const, linkedinReview: true };
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "generate_document",
      hints,
    });
    const generation = await repository.insertGeneration({
      profileId: profile.id,
      documentId: document.id,
      versionId: version.id,
      kind: "linkedin_review",
      profileVersionId: latest.profileVersionId ?? written.profileVersionId,
      settings: written.settings,
      language: version.language,
      reviewDepth: "quick",
      writingLevel: written.writingLevel,
      tone: written.tone,
    });
    const { realtime } = await this.tasks.startOrUndo(
      {
        userId: input.userId,
        type: "generate_document",
        subjectId: generation.id,
        hints,
      },
      () => failGeneration(this.db, generation.id)
    );
    return { generationId: generation.id, realtime };
  }

  /**
   * Writes one section of a version again (resume spec, "LinkedIn"): the
   * headline options, the About, one experience, one project or one
   * education's description, from the profile version the text froze and
   * with the settings it was written with, priced as an adjustment. Its
   * snapshot replaces that section only.
   */
  async regenerateSection(input: {
    userId: string;
    versionId: string;
    section: string;
  }): Promise<{ generationId: string; realtime: RealtimeSubscription }> {
    const { version, document, profile } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    if (document.kind !== "linkedin") throw notFound();
    const repository = new DocumentsRepository(this.db);
    const latest = await repository.latestSnapshot(version.id);
    const written = await repository.latestWrittenGeneration(version.id);
    if (!latest || !written) throw notFound();
    const cipher = await getUserCipher(this.db, input.userId);
    const content = decryptDocument(cipher, latest);
    if (content.kind !== "linkedin" || !redoableSection(content, input.section))
      throw notFound();
    const hints = {
      documentKind: "linkedin" as const,
      linkedinSection: true,
      maximum: written.writingLevel === "maximum",
    };
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "generate_document",
      hints,
    });
    const generation = await repository.insertGeneration({
      profileId: profile.id,
      documentId: document.id,
      versionId: version.id,
      kind: "linkedin_section",
      section: input.section,
      profileVersionId: latest.profileVersionId ?? written.profileVersionId,
      settings: written.settings,
      language: version.language,
      reviewDepth: "quick",
      writingLevel: written.writingLevel,
      tone: written.tone,
    });
    const { realtime } = await this.tasks.startOrUndo(
      {
        userId: input.userId,
        type: "generate_document",
        subjectId: generation.id,
        hints,
      },
      () => failGeneration(this.db, generation.id)
    );
    return { generationId: generation.id, realtime };
  }

  /**
   * One section's text to paste on LinkedIn (`about`, or a position's id).
   * Like any document leaving the platform, a text whose official snapshot
   * has coverage findings is refused.
   */
  async sectionText(input: {
    userId: string;
    versionId: string;
    section: string;
    acknowledgeWarnings?: boolean;
  }): Promise<{ text: string }> {
    const { version, document, profile } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    if (document.kind !== "linkedin") throw notFound();
    const repository = new DocumentsRepository(this.db);
    const latest = await repository.latestSnapshot(version.id);
    if (!latest) throw notFound();
    const cipher = await getUserCipher(this.db, input.userId);
    await assertSendable({
      db: this.db,
      cipher,
      profileId: profile.id,
      document,
      version,
      snapshot: latest,
      contexts: new FrozenContexts(this.db, cipher, profile.id),
      acknowledgeWarnings: input.acknowledgeWarnings,
    });
    const content = decryptDocument(cipher, latest);
    if (content.kind !== "linkedin") throw notFound();
    const text = sectionText(content, input.section, version.language);
    if (text === null) throw notFound();
    return { text };
  }
}
