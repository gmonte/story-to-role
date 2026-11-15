import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { createSensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { localEmbedder } from "@repo/api/tools/embeddings/embedder";
import { getStorage } from "@repo/api/tools/storage/storage";

import { refreshVersionVectors } from "../similar/embed-versions";
import { runGenerateResume } from "../generation/run-generate-resume";

export const generateDocumentTask = task({
  id: "generate_document",
  retry: { maxAttempts: 1 },
  maxDuration: 900,
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "generate_document" },
      async ({ userId, subjectId, reportProgress }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no generation`);
        const { ai, cipher, sensitiveFilter } = await createTaskAi({
          db,
          userId,
          taskId,
        });
        await runGenerateResume({
          db,
          ai,
          cipher,
          filter: sensitiveFilter ?? createSensitiveFilter([]),
          userId,
          generationId: subjectId,
          reportProgress,
          storage: getStorage(),
        });
        // The new snapshot's vector, for similar-document suggestions.
        await refreshVersionVectors({
          db,
          cipher,
          embedder: localEmbedder,
          userId,
        });
      }
    );
  },
});
