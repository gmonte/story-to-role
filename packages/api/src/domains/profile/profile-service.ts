import { TRPCError } from "@trpc/server";

import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { ProfileRepository } from "./profile-repository";
import type {
  ProfileDocumentKind,
  ProfileDraft,
  ProfileVersionSummary,
} from "./schemas/profile";
import { parseBlocks, serializeBlocks } from "./truth/blocks";
import { hasFormatErrors, lintProfile } from "./truth/lint";
import type { ProfileLanguage } from "./truth/sections";
import { profileTemplate } from "./truth/template";

const kind: ProfileDocumentKind = "profile";

function versionSummary(version: ProfileVersionSummary): ProfileVersionSummary {
  return {
    id: version.id,
    number: version.number,
    publishedAt: version.publishedAt,
    validatedAt: version.validatedAt,
  };
}

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
  constructor(private readonly db: DbClient) {}

  async getDraft(input: {
    userId: string;
    language: ProfileLanguage;
  }): Promise<ProfileDraft> {
    const repository = new ProfileRepository(this.db);
    const document = await repository.findDocument(input.userId, kind);
    if (!document) {
      return {
        markdown: serializeBlocks(profileTemplate(input.language)),
        revision: 0,
        updatedAt: null,
        publishedVersion: null,
        changedSincePublished: true,
      };
    }
    const cipher = await getUserCipher(this.db, input.userId);
    const markdown = cipher.decrypt(document.encryptedDraft);
    const published = document.publishedVersionId
      ? await repository.findVersion(document.id, document.publishedVersionId)
      : undefined;
    return {
      markdown,
      revision: document.draftRevision,
      updatedAt: document.draftUpdatedAt,
      publishedVersion: published ? versionSummary(published) : null,
      changedSincePublished:
        !published || cipher.decrypt(published.encryptedMarkdown) !== markdown,
    };
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
  }) {
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
      findings: lintProfile(blocks),
    };
  }

  /**
   * Publishes the draft as a new, numbered version (profile spec, "Validate
   * and publish"). Format findings block it; content findings never do. A
   * draft equal to the published version publishes nothing new.
   */
  async publish(input: { userId: string; baseRevision: number }) {
    const cipher = await getUserCipher(this.db, input.userId);
    return this.db.transaction(async (tx) => {
      const repository = new ProfileRepository(tx);
      const document = await repository.findDocumentForUpdate(
        input.userId,
        kind
      );
      if (!document) throw new TRPCError({ code: "NOT_FOUND" });
      if (document.draftRevision !== input.baseRevision) throw staleDraft();
      const markdown = cipher.decrypt(document.encryptedDraft);
      if (hasFormatErrors(lintProfile(parseBlocks(markdown)))) {
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
          return { versionId: current.id, number: current.number };
        }
      }
      const version = await repository.insertVersion({
        documentId: document.id,
        number: await repository.nextVersionNumber(document.id),
        encryptedMarkdown: cipher.encrypt(markdown),
      });
      await repository.updateDocument(document.id, {
        publishedVersionId: version.id,
      });
      return { versionId: version.id, number: version.number };
    });
  }

  async listVersions(userId: string) {
    const repository = new ProfileRepository(this.db);
    const document = await repository.findDocument(userId, kind);
    return document ? repository.listVersions(document.id) : [];
  }

  async getVersion(input: { userId: string; profileVersionId: string }) {
    const repository = new ProfileRepository(this.db);
    const document = await repository.findDocument(input.userId, kind);
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
  }) {
    const { markdown } = await this.getVersion(input);
    return this.saveDraft({
      userId: input.userId,
      markdown,
      baseRevision: input.baseRevision,
    });
  }
}
