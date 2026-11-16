import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";

import { runUnderstandSession } from "../run-understand-session";

/** "What the AI understood" about a session's drafts, for its review. */
export const understandSessionTask = task({
  id: "understand_session",
  retry: { maxAttempts: 1 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "understand_session" },
      async ({ userId, subjectId }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no session`);
        const { ai, cipher } = await createTaskAi({ db, userId, taskId });
        await runUnderstandSession({
          db,
          ai,
          cipher,
          userId,
          sessionId: subjectId,
        });
      }
    );
  },
});
