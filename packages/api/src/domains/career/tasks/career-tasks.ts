import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { getStorage } from "@repo/api/tools/storage/storage";

import { runImportDocument } from "../documents/run-import-document";
import { runDraftNarrative, runSummarizePosition } from "../run-career-writing";

export const importDocumentTask = task({
  id: "import_document",
  retry: { maxAttempts: 1 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "import_document" },
      async ({ userId, subjectId, reportProgress }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no document`);
        await reportProgress({ step: 1, totalSteps: 2 });
        const { ai, cipher } = await createTaskAi({ db, userId, taskId });
        await runImportDocument({
          db,
          ai,
          cipher,
          storage: getStorage(),
          userId,
          sourceDocumentId: subjectId,
        });
        await reportProgress({ step: 2, totalSteps: 2 });
      }
    );
  },
});

export const summarizePositionTask = task({
  id: "summarize_position",
  retry: { maxAttempts: 2 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "summarize_position" },
      async ({ userId, subjectId }) => {
        const { ai, cipher, profileId } = await createTaskAi({
          db,
          userId,
          taskId,
        });
        if (!subjectId || !profileId)
          throw new Error(`Task ${taskId} has no position`);
        await runSummarizePosition({
          db,
          ai,
          cipher,
          profileId,
          positionId: subjectId,
        });
      }
    );
  },
});

export const draftNarrativeTask = task({
  id: "draft_narrative",
  retry: { maxAttempts: 1 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "draft_narrative" },
      async ({ userId }) => {
        const { ai, cipher, profileId } = await createTaskAi({
          db,
          userId,
          taskId,
        });
        if (!profileId) throw new Error(`Task ${taskId} has no profile`);
        await runDraftNarrative({ db, ai, cipher, profileId });
      }
    );
  },
});
