import { TRPCError } from "@trpc/server";

import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";
import { creditCap } from "@repo/api/domains/credits/credit-pricing";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { logger } from "@repo/common/tools/logger";

import {
  addPreference,
  lintPreferences,
  preferencesTemplate,
} from "./preferences/preferences";
import { reviewNoteKey } from "./truth/finding-key";
import { ProfileRepository } from "./profile-repository";
import type {
  ProfileDocumentKind,
  ProfileDraft,
  ProfileSuggestion,
  ProfileVersionSummary,
} from "./schemas/profile";
import {
  validationReportSchema,
  type ProfileValidation,
} from "./schemas/validation";
import { readSuggestionContent } from "./suggestions/propose-suggestion";
import {
  parseBlocks,
  serializeBlocks,
  type ProfileBlock,
} from "./truth/blocks";
import { changedChunks } from "./truth/chunks";
import { addOccasionalLevelLine } from "./truth/insert";
import { extractProfile, profilePassages } from "./truth/extract";
import {
  hasFormatErrors,
  lintProfile,
  type ProfileFinding,
} from "./truth/lint";
import type { ProfileLanguage } from "./truth/sections";
import { profileTemplate } from "./truth/template";

const profileKind: ProfileDocumentKind = "profile";

/** What differs between the profile and the job preferences documents. */
const documentKinds = {
  profile: { template: profileTemplate, lint: lintProfile },
  preferences: { template: preferencesTemplate, lint: lintPreferences },
} satisfies Record<
  ProfileDocumentKind,
  {
    template: (language: ProfileLanguage) => ProfileBlock[];
    lint: (blocks: ProfileBlock[]) => ProfileFinding[];
  }
>;

function versionSummary(version: ProfileVersionSummary): ProfileVersionSummary {
  return {
    id: version.id,
    number: version.number,
    publishedAt: version.publishedAt,
    validatedAt: version.validatedAt,
  };
}

// A bound, not a limit anyone meets: the oldest keys fall away first.
const maxDismissedFindings = 500;

// What Validate's cost depends on: the parts it reviews and the whole
// profile it reads them in.
const validationHints = (draft: ProfileBlock[], parts: unknown[]) => ({
  parts: parts.length,
  profileCharacters: serializeBlocks(draft).length,
});

/** A stale tab saving over a newer draft (another tab, a restore). */
const staleDraft = () =>
  new TRPCError({
    code: "CONFLICT",
    message: "The profile changed elsewhere; reload to keep editing.",
  });

/**
 * The user's profile_truth (profile spec): the draft they edit, saved as
 * they type, and its published versions. Every read and write checks the
 * owner and keeps the text encrypted with the user's key.
 */
export class ProfileService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db)
  ) {}

  async getDraft(input: {
    userId: string;
    language: ProfileLanguage;
    kind?: ProfileDocumentKind;
  }): Promise<ProfileDraft> {
    const kind = input.kind ?? profileKind;
    const repository = new ProfileRepository(this.db);
    const document = await repository.findDocument(input.userId, kind);
    if (!document) {
      return {
        markdown: serializeBlocks(documentKinds[kind].template(input.language)),
        revision: 0,
        updatedAt: null,
        publishedVersion: null,
        changedSincePublished: true,
        dismissedFindings: [],
      };
    }
    const cipher = await getUserCipher(this.db, input.userId);
    let markdown = cipher.decrypt(document.encryptedDraft);
    let current = document;
    if (kind === profileKind && !document.occasionalLevelAddedAt) {
      current = await this.addOccasionalLevel(input.userId, kind, cipher);
      markdown = cipher.decrypt(current.encryptedDraft);
    }
    const published = document.publishedVersionId
      ? await repository.findVersion(document.id, document.publishedVersionId)
      : undefined;
    return {
      markdown,
      revision: current.draftRevision,
      updatedAt: current.draftUpdatedAt,
      publishedVersion: published ? versionSummary(published) : null,
      changedSincePublished:
        !published || cipher.decrypt(published.encryptedMarkdown) !== markdown,
      dismissedFindings: current.dismissedFindings,
    };
  }

  /**
   * Ignores (or brings back) a content finding of the draft by its key. The
   * key is the finding's own (`findingKey`), so it is only ever a hash; a
   * format finding has none stored, since the editor never offers it.
   */
  async setFindingDismissed(input: {
    userId: string;
    findingKey: string;
    dismissed: boolean;
    kind?: ProfileDocumentKind;
  }) {
    const kind = input.kind ?? profileKind;
    return this.db.transaction(async (tx) => {
      const repository = new ProfileRepository(tx);
      const document = await repository.findDocumentForUpdate(
        input.userId,
        kind
      );
      if (!document) throw new TRPCError({ code: "NOT_FOUND" });
      const others = document.dismissedFindings.filter(
        (key) => key !== input.findingKey
      );
      const next = input.dismissed
        ? [...others, input.findingKey].slice(-maxDismissedFindings)
        : others;
      await repository.updateDocument(document.id, {
        dismissedFindings: next,
      });
      return { dismissedFindings: next };
    });
  }

  /**
   * Once per draft: adds the empty “occasional experience” line to a draft
   * written before that level existed (saved like an edit), and records it,
   * so deleting the line later keeps it deleted. Published versions stay.
   */
  private async addOccasionalLevel(
    userId: string,
    kind: ProfileDocumentKind,
    cipher: Awaited<ReturnType<typeof getUserCipher>>
  ) {
    return this.db.transaction(async (tx) => {
      const repository = new ProfileRepository(tx);
      const document = await repository.findDocumentForUpdate(userId, kind);
      if (!document || document.occasionalLevelAddedAt) return document;
      const blocks = parseBlocks(cipher.decrypt(document.encryptedDraft));
      const next = addOccasionalLevelLine(blocks);
      const now = new Date();
      return repository.updateDocument(
        document.id,
        next === blocks
          ? { occasionalLevelAddedAt: now }
          : {
              encryptedDraft: cipher.encrypt(serializeBlocks(next)),
              draftUpdatedAt: now,
              draftRevision: document.draftRevision + 1,
              occasionalLevelAddedAt: now,
            }
      );
    });
  }

  /**
   * Saves the draft over the revision the editor started from; the first
   * save creates the document. Returns the new revision and the server's
   * lint of what was saved.
   */
  async saveDraft(input: {
    userId: string;
    markdown: string;
    baseRevision: number;
    kind?: ProfileDocumentKind;
  }) {
    const kind = input.kind ?? profileKind;
    const cipher = await getUserCipher(this.db, input.userId);
    // Stored in the canonical layout, so the downloaded file is the method's.
    const blocks = parseBlocks(input.markdown);
    const markdown = serializeBlocks(blocks);
    const now = new Date();
    const saved = await this.db.transaction(async (tx) => {
      const repository = new ProfileRepository(tx);
      const document = await repository.findDocumentForUpdate(
        input.userId,
        kind
      );
      if (!document) {
        if (input.baseRevision !== 0) throw staleDraft();
        const created = await repository.insertDocument({
          userId: input.userId,
          kind,
          encryptedDraft: cipher.encrypt(markdown),
          draftUpdatedAt: now,
          draftRevision: 1,
        });
        // Another tab created it first.
        if (!created) throw staleDraft();
        return created;
      }
      if (document.draftRevision !== input.baseRevision) throw staleDraft();
      return repository.updateDocument(document.id, {
        encryptedDraft: cipher.encrypt(markdown),
        draftUpdatedAt: now,
        draftRevision: document.draftRevision + 1,
      });
    });
    return {
      revision: saved.draftRevision,
      updatedAt: saved.draftUpdatedAt,
      findings: documentKinds[kind].lint(blocks),
    };
  }

  /**
   * Publishes the draft as a new, numbered version (profile spec, "Validate
   * and publish"). Format findings block it; content findings never do. A
   * draft equal to the published version publishes nothing new.
   */
  async publish(input: {
    userId: string;
    baseRevision: number;
    kind?: ProfileDocumentKind;
  }) {
    const kind = input.kind ?? profileKind;
    const cipher = await getUserCipher(this.db, input.userId);
    const published = await this.db.transaction(async (tx) => {
      const repository = new ProfileRepository(tx);
      const document = await repository.findDocumentForUpdate(
        input.userId,
        kind
      );
      if (!document) throw new TRPCError({ code: "NOT_FOUND" });
      if (document.draftRevision !== input.baseRevision) throw staleDraft();
      const markdown = cipher.decrypt(document.encryptedDraft);
      const blocks = parseBlocks(markdown);
      if (hasFormatErrors(documentKinds[kind].lint(blocks))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Fix the format findings before publishing.",
        });
      }
      if (document.publishedVersionId) {
        const current = await repository.findVersion(
          document.id,
          document.publishedVersionId
        );
        if (current && cipher.decrypt(current.encryptedMarkdown) === markdown) {
          return {
            versionId: current.id,
            number: current.number,
            hasPassages: false,
          };
        }
      }
      // The job preferences are versioned without validation, and screening
      // reads their text as it is.
      if (kind === "preferences") {
        const version = await publishVersion(repository, document.id, {
          encryptedMarkdown: cipher.encrypt(markdown),
        });
        return {
          versionId: version.id,
          number: version.number,
          hasPassages: false,
        };
      }
      // Validated when a review finished since the last publish: fixing
      // what it found afterwards keeps the version validated.
      const validation = await repository.latestValidation(document.id);
      const validated =
        validation?.status === "completed" &&
        validation.baseVersionId === document.publishedVersionId;
      const version = await publishVersion(repository, document.id, {
        encryptedMarkdown: cipher.encrypt(markdown),
        validatedAt: validated ? validation.completedAt : null,
      });
      // What the rest of the product reads (profile spec, "Data model").
      await repository.insertExtract({
        versionId: version.id,
        encryptedContent: cipher.encrypt(
          JSON.stringify(extractProfile(blocks))
        ),
      });
      // A passage unchanged since the last version keeps its vector
      // (ADR 0004): only what changed is embedded again.
      const previousVectors = new Map<string, number[]>();
      if (document.publishedVersionId) {
        for (const row of await repository.listPassages(
          document.publishedVersionId
        )) {
          if (row.embedding) {
            previousVectors.set(
              cipher.decrypt(row.encryptedText),
              row.embedding
            );
          }
        }
      }
      await repository.insertPassages(
        profilePassages(blocks).map((passage, ordinal) => ({
          versionId: version.id,
          ordinal,
          kind: passage.kind,
          section: passage.section,
          experience: passage.experience,
          encryptedText: cipher.encrypt(passage.text),
          embedding: previousVectors.get(passage.text) ?? null,
        }))
      );
      return {
        versionId: version.id,
        number: version.number,
        hasPassages: true,
      };
    });
    // Only a new version of the profile has passages to embed.
    if (published.hasPassages) {
      // Vectors are computed locally and cost the user nothing; a failure
      // to start them leaves the passages for the next publish to retry.
      try {
        await this.tasks.start({
          userId: input.userId,
          type: "embed_profile",
          subjectId: published.versionId,
        });
      } catch (error) {
        logger.warn(["profile"], "Profile vectors not started", { error });
      }
    }
    return { versionId: published.versionId, number: published.number };
  }

  /** What Validate would review now, and its cost cap. */
  async validationEstimate(userId: string) {
    const { draft, published } = await this.loadForValidation(userId);
    const parts = changedChunks(draft, published);
    return {
      parts: parts.map((part) => part.title),
      credits: parts.length
        ? creditCap("validate_profile", validationHints(draft, parts))
        : 0,
    };
  }

  private async loadForValidation(userId: string) {
    const repository = new ProfileRepository(this.db);
    const document = await repository.findDocument(userId, profileKind);
    if (!document) throw new TRPCError({ code: "NOT_FOUND" });
    const cipher = await getUserCipher(this.db, userId);
    const version = document.publishedVersionId
      ? await repository.findVersion(document.id, document.publishedVersionId)
      : undefined;
    return {
      document,
      draft: parseBlocks(cipher.decrypt(document.encryptedDraft)),
      published: version
        ? parseBlocks(cipher.decrypt(version.encryptedMarkdown))
        : null,
    };
  }

  /**
   * Starts Validate on the saved draft (profile spec, "Validate and
   * publish"), charged to the user's credits: the parts that changed since
   * the published version, one review at a time.
   */
  async validate(input: { userId: string; baseRevision: number }) {
    const { document, draft, published } = await this.loadForValidation(
      input.userId
    );
    if (document.draftRevision !== input.baseRevision) throw staleDraft();
    const parts = changedChunks(draft, published);
    if (!parts.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Nothing changed since the published version.",
      });
    }
    const repository = new ProfileRepository(this.db);
    const latest = await repository.latestValidation(document.id);
    if (latest?.status === "running") {
      const active = await new TasksRepository(this.db).activeTask(
        latest.id,
        "validate_profile"
      );
      if (active) throw new TRPCError({ code: "CONFLICT" });
      await repository.updateValidation(latest.id, {
        status: "failed",
        completedAt: new Date(),
      });
    }
    const hints = validationHints(draft, parts);
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "validate_profile",
      hints,
    });
    const validation = await repository.insertValidation({
      documentId: document.id,
      draftRevision: document.draftRevision,
      baseVersionId: document.publishedVersionId,
      status: "running",
    });
    const { realtime } = await this.tasks.startOrUndo(
      {
        userId: input.userId,
        type: "validate_profile",
        subjectId: validation.id,
        hints,
      },
      () =>
        repository.updateValidation(validation.id, {
          status: "failed",
          completedAt: new Date(),
        })
    );
    return { profileValidationId: validation.id, realtime };
  }

  /** The last validation, its progress while it runs and its report. */
  async latestValidation(userId: string): Promise<ProfileValidation | null> {
    const repository = new ProfileRepository(this.db);
    const document = await repository.findDocument(userId, profileKind);
    const validation = document
      ? await repository.latestValidation(document.id)
      : undefined;
    if (!validation) return null;
    // A run that died (a crashed worker) leaves its row running: past its
    // task's life it counts as failed, so nothing waits on it forever.
    if (
      validation.status === "running" &&
      // Its task is created a moment after the row.
      Date.now() - validation.createdAt.getTime() > 30_000 &&
      !(await new TasksRepository(this.db).activeTask(
        validation.id,
        "validate_profile"
      ))
    ) {
      await repository.updateValidation(validation.id, {
        status: "failed",
        completedAt: new Date(),
      });
      validation.status = "failed";
    }
    const cipher = await getUserCipher(this.db, userId);
    const progress =
      validation.status === "running"
        ? await new TasksRepository(this.db).latestProgress(
            validation.id,
            "validate_profile"
          )
        : null;
    return {
      id: validation.id,
      status: validation.status,
      draftRevision: validation.draftRevision,
      createdAt: validation.createdAt,
      progress: progress ?? null,
      report: validation.encryptedReport
        ? validationReportSchema.parse(
            JSON.parse(cipher.decrypt(validation.encryptedReport))
          )
        : null,
    };
  }

  /**
   * The quality-review notes of the last completed validation that the
   * user hasn't resolved, each with its key (`reviewNoteKey`).
   */
  async unresolvedReviewNotes(userId: string) {
    const repository = new ProfileRepository(this.db);
    const document = await repository.findDocument(userId, profileKind);
    const validation = document
      ? await repository.latestValidation(document.id)
      : undefined;
    if (!document || validation?.status !== "completed") return [];
    if (!validation.encryptedReport) return [];
    const cipher = await getUserCipher(this.db, userId);
    const report = validationReportSchema.parse(
      JSON.parse(cipher.decrypt(validation.encryptedReport))
    );
    const resolved = new Set(document.dismissedFindings);
    return report.findings
      .map((finding) => ({ ...finding, key: reviewNoteKey(finding) }))
      .filter((note) => !resolved.has(note.key));
  }

  async listVersions(userId: string, kind = profileKind) {
    const repository = new ProfileRepository(this.db);
    const document = await repository.findDocument(userId, kind);
    return document ? repository.listVersions(document.id) : [];
  }

  async getVersion(input: {
    userId: string;
    profileVersionId: string;
    kind?: ProfileDocumentKind;
  }) {
    const repository = new ProfileRepository(this.db);
    const document = await repository.findDocument(
      input.userId,
      input.kind ?? profileKind
    );
    const version = document
      ? await repository.findVersion(document.id, input.profileVersionId)
      : undefined;
    if (!version) throw new TRPCError({ code: "NOT_FOUND" });
    const cipher = await getUserCipher(this.db, input.userId);
    return {
      ...versionSummary(version),
      markdown: cipher.decrypt(version.encryptedMarkdown),
    };
  }

  /** Copies a published version into the draft, as a new draft revision. */
  async restoreVersion(input: {
    userId: string;
    profileVersionId: string;
    baseRevision: number;
    kind?: ProfileDocumentKind;
  }) {
    const { markdown } = await this.getVersion(input);
    return this.saveDraft({
      userId: input.userId,
      kind: input.kind,
      markdown,
      baseRevision: input.baseRevision,
    });
  }

  /** The suggestions waiting for the user to accept or reject. */
  async listSuggestions(userId: string): Promise<ProfileSuggestion[]> {
    const repository = new ProfileRepository(this.db);
    const document = await repository.findDocument(userId, profileKind);
    if (!document) return [];
    const cipher = await getUserCipher(this.db, userId);
    return (await repository.listPendingSuggestions(document.id)).map(
      (row) => ({
        id: row.id,
        origin: row.origin,
        createdAt: row.createdAt,
        ...readSuggestionContent(cipher, row),
      })
    );
  }

  /**
   * Records what the user did with suggestions: the given ones, or every
   * pending one. An accepted change reaches the draft through the editor,
   * which applied it (one undo step) and saves it like any edit.
   */
  async resolveSuggestions(input: {
    userId: string;
    resolution: "accepted" | "rejected";
    profileSuggestionIds?: string[];
  }) {
    const repository = new ProfileRepository(this.db);
    const document = await repository.findDocument(input.userId, profileKind);
    if (!document) throw new TRPCError({ code: "NOT_FOUND" });
    const resolved = await repository.resolveSuggestions({
      documentId: document.id,
      resolution: input.resolution,
      profileSuggestionIds: input.profileSuggestionIds,
    });
    return { resolved };
  }

  /**
   * Puts accepted suggestions back to waiting: the user undid them in the
   * editor, which took the change out of the draft.
   */
  async reopenSuggestions(input: {
    userId: string;
    profileSuggestionIds: string[];
  }) {
    const repository = new ProfileRepository(this.db);
    const document = await repository.findDocument(input.userId, profileKind);
    if (!document) throw new TRPCError({ code: "NOT_FOUND" });
    const reopened = await repository.reopenSuggestions({
      documentId: document.id,
      profileSuggestionIds: input.profileSuggestionIds,
    });
    return { reopened };
  }

  /**
   * Adds a company to the job preferences' excluded companies (profile
   * spec: "A company can be excluded from an opening or the tracker, which
   * adds it here"): in the draft, and in what screening reads, as a new
   * published version, since the user asked for it to count from now on.
   * Only the company is published: what else the draft holds unpublished
   * stays a draft, and preferences never published start from the template.
   */
  async excludeCompany(input: {
    userId: string;
    company: string;
    // The day it was excluded, in the user's own calendar (YYYY-MM-DD).
    date: string;
    language: ProfileLanguage;
  }) {
    await this.addPreferenceLine({
      userId: input.userId,
      language: input.language,
      entry: {
        section: "excludedCompanies",
        company: input.company,
        date: input.date,
      },
    });
  }

  /**
   * Adds a discard rule to the job preferences (tracker spec: a decline
   * reason "can become a rule in the job preferences"): the same direct
   * path as excludeCompany, with no suggestion in between. The rule is one
   * line, so line breaks in the text become spaces.
   */
  async addDiscardRule(input: {
    userId: string;
    text: string;
    language: ProfileLanguage;
  }) {
    const text = input.text.replace(/\s+/g, " ").trim();
    if (!text) throw new TRPCError({ code: "BAD_REQUEST" });
    await this.addPreferenceLine({
      userId: input.userId,
      language: input.language,
      entry: { section: "discardRules", text },
    });
    return { text };
  }

  private async addPreferenceLine(input: {
    userId: string;
    language: ProfileLanguage;
    entry: Parameters<typeof addPreference>[1];
  }) {
    const { entry } = input;
    const kind: ProfileDocumentKind = "preferences";
    const cipher = await getUserCipher(this.db, input.userId);
    await this.db.transaction(async (tx) => {
      const repository = new ProfileRepository(tx);
      const existing = await repository.findDocumentForUpdate(
        input.userId,
        kind
      );
      const draft = addPreference(
        existing
          ? parseBlocks(cipher.decrypt(existing.encryptedDraft))
          : preferencesTemplate(input.language),
        entry
      );
      const document = existing
        ? await repository.updateDocument(existing.id, {
            encryptedDraft: cipher.encrypt(serializeBlocks(draft)),
            draftUpdatedAt: new Date(),
            draftRevision: existing.draftRevision + 1,
          })
        : await repository.insertDocument({
            userId: input.userId,
            kind,
            encryptedDraft: cipher.encrypt(serializeBlocks(draft)),
            draftUpdatedAt: new Date(),
            draftRevision: 1,
          });
      if (!document) throw new TRPCError({ code: "CONFLICT" });
      const current = document.publishedVersionId
        ? await repository.findVersion(document.id, document.publishedVersionId)
        : undefined;
      const currentMarkdown = current
        ? cipher.decrypt(current.encryptedMarkdown)
        : null;
      const markdown = serializeBlocks(
        addPreference(
          currentMarkdown === null
            ? preferencesTemplate(input.language)
            : parseBlocks(currentMarkdown),
          entry
        )
      );
      // Already there in what screening reads.
      if (markdown === currentMarkdown) return;
      await publishVersion(repository, document.id, {
        encryptedMarkdown: cipher.encrypt(markdown),
      });
    });
  }
}

/** A new version of a document, made the one the product reads. */
async function publishVersion(
  repository: ProfileRepository,
  documentId: string,
  content: { encryptedMarkdown: string; validatedAt?: Date | null }
) {
  const version = await repository.insertVersion({
    documentId,
    number: await repository.nextVersionNumber(documentId),
    ...content,
  });
  await repository.updateDocument(documentId, {
    publishedVersionId: version.id,
  });
  return version;
}
