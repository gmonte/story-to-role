import { task } from "@trigger.dev/sdk";

import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";
import { getStorage } from "@repo/api/tools/storage/storage";

import { runRenderPdf } from "../rendering/run-render-pdf";

export const renderPdfTask = task({
  id: "render_pdf",
  retry: { maxAttempts: 2 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "render_pdf" },
      async ({ userId, subjectId }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no snapshot`);
        await runRenderPdf({
          db,
          cipher: await getUserCipher(db, userId),
          storage: getStorage(),
          userId,
          snapshotId: subjectId,
        });
      }
    );
  },
});
