import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";

import { ResearchRepository } from "../research/research-repository";
import { runResearchCompany } from "../research/run-research-company";

export const researchCompanyTask = task({
  id: "research_company",
  retry: { maxAttempts: 1 },
  maxDuration: 300,
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "research_company" },
      async ({ userId, subjectId, reportProgress }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no research`);
        // Whatever fails, the run ends as failed: never left researching.
        try {
          const { ai, cipher } = await createTaskAi({ db, userId, taskId });
          await runResearchCompany({
            reportProgress,
            db,
            ai,
            cipher,
            userId,
            researchId: subjectId,
          });
        } catch (error) {
          await new ResearchRepository(db).setResearchStatus(
            subjectId,
            "failed"
          );
          throw error;
        }
      }
    );
  },
});
