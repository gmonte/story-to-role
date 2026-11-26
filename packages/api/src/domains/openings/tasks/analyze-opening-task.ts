import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { taskMaxDuration } from "@repo/api/domains/tasks/task-durations";
import { db } from "@repo/api/tools/db";
import {
  embeddingMachine,
  localEmbedder,
} from "@repo/api/tools/embeddings/embedder";

import { runAnalyzeOpening } from "../fit-check/run-analyze-opening";
import { readLinkTask } from "./read-link-task";

export const analyzeOpeningTask = task({
  id: "analyze_opening",
  machine: embeddingMachine,
  retry: { maxAttempts: 1 },
  maxDuration: taskMaxDuration.analyze_opening,
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
