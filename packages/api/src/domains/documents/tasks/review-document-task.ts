import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";

import { runReviewResume } from "../generation/run-review-resume";

export const reviewDocumentTask = task({
  id: "review_document",
  retry: { maxAttempts: 1 },
  maxDuration: 300,
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "review_document" },
      async ({ userId, subjectId, reviewers, reportProgress }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no snapshot`);
        const { ai, cipher } = await createTaskAi({ db, userId, taskId });
        await runReviewResume({
          db,
          ai,
          cipher,
          userId,
          snapshotId: subjectId,
          reviewers,
          reportProgress,
        });
      }
    );
  },
});
