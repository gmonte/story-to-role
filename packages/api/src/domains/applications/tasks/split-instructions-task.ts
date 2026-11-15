import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";

import { InstructionsRepository } from "../instructions-repository";
import { runSplitInstructions } from "../run-split-instructions";

export const splitInstructionsTask = task({
  id: "split_instructions",
  retry: { maxAttempts: 1 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "split_instructions" },
      async ({ userId, subjectId }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no instructions`);
        try {
          const { ai, cipher } = await createTaskAi({ db, userId, taskId });
          await runSplitInstructions({
            db,
            ai,
            cipher,
            userId,
            applicationInstructionsId: subjectId,
          });
        } catch (error) {
          await new InstructionsRepository(db).updateInstructions(subjectId, {
            status: "failed",
          });
          throw error;
        }
      }
    );
  },
});
