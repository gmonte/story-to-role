import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";

import { runResearchCompany } from "../research/run-research-company";

export const researchCompanyTask = task({
  id: "research_company",
  retry: { maxAttempts: 1 },
  maxDuration: 300,
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "research_company" },
      async ({ userId, subjectId }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no research`);
        const { ai, cipher } = await createTaskAi({ db, userId, taskId });
        await runResearchCompany({
          db,
          ai,
          cipher,
          userId,
          researchId: subjectId,
        });
      }
    );
  },
});
