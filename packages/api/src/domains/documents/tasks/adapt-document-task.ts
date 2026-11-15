import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { createSensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { getStorage } from "@repo/api/tools/storage/storage";

import { runAdaptDocument } from "../adaptation/run-adapt-document";

export const adaptDocumentTask = task({
  id: "adapt_document",
  retry: { maxAttempts: 1 },
  maxDuration: 600,
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "adapt_document" },
      async ({ userId, subjectId, reportProgress }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no generation`);
        const { ai, cipher, sensitiveFilter } = await createTaskAi({
          db,
          userId,
          taskId,
        });
        await runAdaptDocument({
          db,
          ai,
          cipher,
          filter: sensitiveFilter ?? createSensitiveFilter([]),
          userId,
          generationId: subjectId,
          reportProgress,
          storage: getStorage(),
        });
      }
    );
  },
});
