import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";

import { runExtractStyle } from "../writing/run-extract-style";

export const extractStyleTask = task({
  id: "extract_style_profile",
  retry: { maxAttempts: 1 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "extract_style_profile" },
      async ({ userId, subjectId }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no profile`);
        const { ai, cipher } = await createTaskAi({ db, userId, taskId });
        await runExtractStyle({ db, ai, cipher, userId, profileId: subjectId });
      }
    );
  },
});
