import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { redisMisuseGuard } from "@repo/api/tools/misuse-guard";

import { runLinkedinTurn } from "../linkedin/run-linkedin-turn";

export const linkedinTurnTask = task({
  id: "linkedin_turn",
  retry: { maxAttempts: 1 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "linkedin_turn" },
      async ({ userId, subjectId }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no interview`);
        const { ai, cipher } = await createTaskAi({ db, userId, taskId });
        // The runner marks its own interview failed; nobody else's.
        await runLinkedinTurn({
          db,
          ai,
          cipher,
          misuse: redisMisuseGuard,
          userId,
          interviewId: subjectId,
        });
      }
    );
  },
});
