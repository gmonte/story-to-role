import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";

import { MotivationRepository } from "../motivation/motivation-repository";
import { runMotivationTurn } from "../motivation/run-motivation-turn";

export const motivationTurnTask = task({
  id: "motivation_turn",
  retry: { maxAttempts: 1 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "motivation_turn" },
      async ({ userId, subjectId }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no interview`);
        try {
          const { ai, cipher } = await createTaskAi({ db, userId, taskId });
          await runMotivationTurn({
            db,
            ai,
            cipher,
            userId,
            interviewId: subjectId,
          });
        } catch (error) {
          await new MotivationRepository(db).updateInterview(subjectId, {
            status: "failed",
          });
          throw error;
        }
      }
    );
  },
});
