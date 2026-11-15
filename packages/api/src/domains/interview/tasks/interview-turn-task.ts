import { schedules, task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { redisMisuseGuard } from "@repo/api/tools/misuse-guard";

import { InterviewRepository } from "../interview-repository";
import { runInterviewTurn } from "../run-interview-turn";

export const interviewTurnTask = task({
  id: "interview_turn",
  retry: { maxAttempts: 1 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "interview_turn" },
      async ({ userId, subjectId }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no turn`);
        const { ai, cipher } = await createTaskAi({ db, userId, taskId });
        await runInterviewTurn({
          db,
          ai,
          cipher,
          misuse: redisMisuseGuard,
          userId,
          userTurnId: subjectId,
        });
      }
    );
  },
});

/** Privacy spec: transcripts go 7 days after their extraction is approved. */
export const purgeTranscriptsTask = schedules.task({
  id: "purge_transcripts",
  cron: "0 4 * * *",
  run: async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const deleted = await new InterviewRepository(db).deleteTurnsApprovedBefore(
      cutoff
    );
    return { deleted };
  },
});
