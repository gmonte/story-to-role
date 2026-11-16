import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { localEmbedder } from "@repo/api/tools/embeddings/embedder";

import { runAnalyzeOpening } from "../fit-check/run-analyze-opening";
import { readLinkTask } from "./read-link-task";

export const analyzeOpeningTask = task({
  id: "analyze_opening",
  retry: { maxAttempts: 1 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "analyze_opening" },
      async ({ userId, subjectId, reportProgress }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no opening`);
        const { ai, cipher } = await createTaskAi({ db, userId, taskId });
        await runAnalyzeOpening({
          reportProgress,
          db,
          ai,
          cipher,
          embedder: localEmbedder,
          readLink: async (url) => {
            const result = await readLinkTask.triggerAndWait({ url });
            return result.ok
              ? result.output
              : { ok: false, reason: "unreachable" };
          },
          userId,
          openingId: subjectId,
        });
      }
    );
  },
});
