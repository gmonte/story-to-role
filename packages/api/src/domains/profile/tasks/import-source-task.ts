import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { getStorage } from "@repo/api/tools/storage/storage";

import { runImportSource } from "../import/run-import-source";

export const importSourceTask = task({
  id: "import_document",
  retry: { maxAttempts: 1 },
  // One import at a time per user (the trigger passes their id as the key):
  // each compares with the suggestions the one before left waiting.
  concurrency: { perKey: 1 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "import_document" },
      async ({ userId, subjectId, reportProgress }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no source`);
        try {
          const { ai, cipher } = await createTaskAi({ db, userId, taskId });
          const outcome = await runImportSource({
            db,
            ai,
            cipher,
            storage: getStorage(),
            userId,
            sourceDocumentId: subjectId,
            reportProgress,
          });
          // A file refused before the comparison did nothing for the user.
          if (outcome.rejected) return { charge: false as const };
        } catch (error) {
          await new CareerRepository(db).updateDocument(subjectId, {
            importStatus: "failed",
          });
          throw error;
        }
      }
    );
  },
});
