import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";

import { ProfileRepository } from "../profile-repository";
import { runValidateProfile } from "../validation/run-validate-profile";

export const validateProfileTask = task({
  id: "validate_profile",
  retry: { maxAttempts: 1 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "validate_profile" },
      async ({ userId, subjectId, reportProgress }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no validation`);
        try {
          const { ai, cipher } = await createTaskAi({
            db,
            userId,
            taskId,
            applyCommunicationRules: false,
          });
          await runValidateProfile({
            db,
            ai,
            cipher,
            userId,
            profileValidationId: subjectId,
            reportProgress,
          });
        } catch (error) {
          await new ProfileRepository(db).updateValidation(subjectId, {
            status: "failed",
            completedAt: new Date(),
          });
          throw error;
        }
      }
    );
  },
});
