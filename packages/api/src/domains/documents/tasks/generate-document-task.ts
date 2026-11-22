import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
import { createNeverIncludeFilter } from "@repo/api/domains/profile/rules/never-include-filter";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { localEmbedder } from "@repo/api/tools/embeddings/embedder";
import { getStorage } from "@repo/api/tools/storage/storage";
import { taskMaxDuration } from "@repo/api/domains/tasks/task-durations";

import { refreshVersionVectors } from "../similar/embed-versions";
import { DocumentsRepository } from "../documents-repository";
import { runGenerateResume } from "../generation/run-generate-resume";
import { runGenerateLinkedin } from "../linkedin/run-generate-linkedin";
import { runGenerateLetter } from "../letter/run-generate-letter";
import { runUpdateLetter } from "../letter/run-update-letter";

export const generateDocumentTask = task({
  id: "generate_document",
  retry: { maxAttempts: 1 },
  maxDuration: taskMaxDuration.generate_document,
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "generate_document" },
      async ({ userId, subjectId, reportProgress }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no generation`);
        const { ai, cipher, neverIncludeFilter } = await createTaskAi({
          db,
          userId,
          taskId,
        });
        const run = {
          db,
          ai,
          cipher,
          filter: neverIncludeFilter ?? createNeverIncludeFilter([]),
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
        } else if (document?.kind === "linkedin") {
          await runGenerateLinkedin({ ...run, reportProgress });
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
