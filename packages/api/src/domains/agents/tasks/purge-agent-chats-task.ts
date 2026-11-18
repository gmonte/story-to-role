import { schedules } from "@trigger.dev/sdk";

import { db } from "@repo/api/tools/db";

import { AgentChatRepository } from "../agent-chat-repository";
import { agentSettings, dayMs } from "../agent-settings";

/**
 * ADR 0007, ADR 0009: an agent's messages (the profile agent's and the
 * document agents') go 7 days after they were written, and a conversation
 * (with its runtime state) once its session has expired.
 */
export const purgeAgentChatsTask = schedules.task({
  id: "purge_agent_chats",
  cron: "15 4 * * *",
  run: async () => {
    const now = Date.now();
    const chats = new AgentChatRepository(db);
    const messages = await chats.deleteMessagesBefore(
      new Date(now - agentSettings.retentionDays * dayMs)
    );
    const expired = await chats.deleteChatsExpiredBefore(new Date(now));
    return { messages, expired };
  },
});
