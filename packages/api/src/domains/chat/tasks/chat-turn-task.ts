import { task } from "@trigger.dev/sdk";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { resolveAiFunding } from "@repo/api/domains/ai/ai-funding";
import { runTask } from "@repo/api/domains/tasks/run-task";
import { db } from "@repo/api/tools/db";

import { runChatTurn } from "../run-chat-turn";

export const chatTurnTask = task({
  id: "chat_turn",
  retry: { maxAttempts: 1 },
  run: async ({ taskId }: { taskId: string }) => {
    await runTask(
      { db, taskId, type: "chat_turn" },
      async ({ userId, subjectId }) => {
        if (!subjectId) throw new Error(`Task ${taskId} has no message`);

        const { funding, providerPackage } = resolveAiFunding();
        const ai = createAiClient({
          db,
          userId,
          taskId,
          funding,
          providerPackage,
        });

        await runChatTurn({ db, ai, userId, chatMessageId: subjectId });
      }
    );
  },
});
