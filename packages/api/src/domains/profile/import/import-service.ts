import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

import { ProfileRepository } from "../profile-repository";
import { serializeBlocks } from "../truth/blocks";
import type { ProfileLanguage } from "../truth/sections";
import { profileTemplate } from "../truth/template";
import { importSettings } from "./import-settings";

/**
 * Starts reading a source into profile suggestions (profile spec,
 * "Importing a resume"), charged to the user's credits. One import of a
 * source at a time; the task itself queues behind the user's other imports.
 */
export class ImportService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db)
  ) {}

  /**
   * `language` is the interface's: a user who never opened the editor gets
   * their profile from the template in it, for the import to compare with.
   */
  async start(input: {
    userId: string;
    sourceDocumentId: string;
    language: ProfileLanguage;
  }) {
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "import_document",
    });
    const cipher = await getUserCipher(this.db, input.userId);
    // Checked and marked under a lock on the source: two requests at once
    // start one import.
    const source = await this.db.transaction(async (tx) => {
      const career = new CareerRepository(tx);
      const profile = await career.findProfileByUserId(input.userId);
      const row = await career.findDocumentForUpdate(input.sourceDocumentId);
      // A source of the user's own: anyone else's is not found.
      if (row?.profileId !== profile?.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (
        row.importStatus === "importing" &&
        (await new TasksRepository(tx).activeTask(
          row.id,
          "import_document",
          importSettings.staleAfterMs
        ))
      ) {
        throw new TRPCError({ code: "CONFLICT" });
      }
      await new ProfileRepository(tx).insertDocument({
        userId: input.userId,
        kind: "profile",
        encryptedDraft: cipher.encrypt(
          serializeBlocks(profileTemplate(input.language))
        ),
        draftUpdatedAt: new Date(),
        draftRevision: 1,
      });
      await career.updateDocument(row.id, {
        importStatus: "importing",
        importRejection: null,
      });
      return row;
    });
    await this.tasks.startOrUndo(
      {
        userId: input.userId,
        type: "import_document",
        subjectId: source.id,
      },
      () =>
        new CareerRepository(this.db).updateDocument(source.id, {
          importStatus: "failed",
        })
    );
  }
}
