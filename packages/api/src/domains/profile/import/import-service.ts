import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";

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

  async start(input: { userId: string; sourceDocumentId: string }) {
    const career = new CareerRepository(this.db);
    const [profile, source] = await Promise.all([
      career.findProfileByUserId(input.userId),
      career.findDocument(input.sourceDocumentId),
    ]);
    // A source of the user's own: anyone else's is not found.
    if (source?.profileId !== profile?.id) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    if (
      source.importStatus === "importing" &&
      (await new TasksRepository(this.db).activeTask(
        source.id,
        "import_document"
      ))
    ) {
      throw new TRPCError({ code: "CONFLICT" });
    }
    await this.tasks.assertAffordable({
      userId: input.userId,
      type: "import_document",
    });
    await career.updateDocument(source.id, {
      importStatus: "importing",
      importRejection: null,
    });
    const { realtime } = await this.tasks.startOrUndo(
      {
        userId: input.userId,
        type: "import_document",
        subjectId: source.id,
      },
      () => career.updateDocument(source.id, { importStatus: "failed" })
    );
    return { realtime };
  }
}
