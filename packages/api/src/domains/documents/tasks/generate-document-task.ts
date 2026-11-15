import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { createSensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { localEmbedder } from "@repo/api/tools/embeddings/embedder";
import { getStorage } from "@repo/api/tools/storage/storage";

import { refreshVersionVectors } from "../similar/embed-versions";
import { DocumentsRepository } from "../documents-repository";
import { runGenerateResume } from "../generation/run-generate-resume";
import { runGenerateLetter } from "../letter/run-generate-letter";
import { runUpdateLetter } from "../letter/run-update-letter";

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
        const run = {
          db,
          ai,
          cipher,
          filter: sensitiveFilter ?? createSensitiveFilter([]),
          userId,
          generationId: subjectId,
        };
        // A resume, a cover letter, or a letter adjusted to its resume.
        const repository = new DocumentsRepository(db);
        const generation = await repository.findGeneration(subjectId);
        const document =
          generation && (await repository.findDocument(generation.documentId));
        if (generation?.kind === "letter_update") {
          await runUpdateLetter(run);
        } else if (document?.kind === "cover_letter") {
          await runGenerateLetter({
            ...run,
            reportProgress,
            storage: getStorage(),
          });
        } else {
          await runGenerateResume({
            ...run,
            reportProgress,
            storage: getStorage(),
          });
        }
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
