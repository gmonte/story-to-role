import { task } from "@trigger.dev/sdk";

import { createTaskAi } from "@repo/api/domains/ai/create-task-ai";
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

        const { ai } = await createTaskAi({ db, userId, taskId });

        await runChatTurn({ db, ai, userId, chatMessageId: subjectId });
      }
    );
  },
});
