import { schedules } from "@trigger.dev/sdk";

import { db } from "@repo/api/tools/db";

import { CareerChatRepository } from "../career-chat-repository";
import { careerChatSettings, dayMs } from "../career-chat-settings";

/**
 * ADR 0007: the career chat's messages go 7 days after they were written,
 * and a conversation (with its runtime state) once its session has expired.
 */
export const purgeCareerChatsTask = schedules.task({
  id: "purge_career_chats",
  cron: "15 4 * * *",
  run: async () => {
    const now = Date.now();
    const chats = new CareerChatRepository(db);
    const messages = await chats.deleteMessagesBefore(
      new Date(now - careerChatSettings.retentionDays * dayMs)
    );
    const expired = await chats.deleteChatsExpiredBefore(new Date(now));
    return { messages, expired };
  },
});
