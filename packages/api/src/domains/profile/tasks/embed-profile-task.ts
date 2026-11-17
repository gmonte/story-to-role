import { task } from "@trigger.dev/sdk";

import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { localEmbedder } from "@repo/api/tools/embeddings/embedder";

import { embedProfileVersion } from "../embed-profile-version";

export const embedProfileTask = task({
  id: "embed_profile",
  retry: { maxAttempts: 2 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "embed_profile" },
      async ({ userId, subjectId }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no version`);
        await embedProfileVersion({
          db,
          cipher: await getUserCipher(db, userId),
          embedder: localEmbedder,
          profileVersionId: subjectId,
        });
      }
    );
  },
});
