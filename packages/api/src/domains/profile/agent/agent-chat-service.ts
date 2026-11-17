import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import { AgentChatRepository } from "./agent-chat-repository";
import { agentSettings, dayMs } from "./agent-settings";
import { createAgentTranscriptStorage } from "./agent-transcript-storage";

/**
 * The profile agent's conversation as the web app reaches it: the user's
 * live one, opened only after the privacy notice, and nobody else's.
 */
export class AgentChatService {
  constructor(private readonly db: DbClient) {}

  /** The agent's messages pass through Trigger.dev: the notice says so. */
  private async requireNotice(userId: string) {
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      userId
    );
    if (!profile?.privacyNoticeAcceptedAt) {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }
  }

  /**
   * The user's live conversation, started when there's none (or the last
   * one's session expired), with its messages.
   */
  async current(userId: string, now = new Date()) {
    await this.requireNotice(userId);
    const chats = new AgentChatRepository(this.db);
    // A session about to expire isn't handed out for a new turn.
    const chat =
      (await chats.findCurrentChat(
        userId,
        new Date(now.getTime() + agentSettings.expiryMarginMs)
      )) ??
      (await chats.insertChat({
        userId,
        expiresAt: new Date(
          now.getTime() + agentSettings.retentionDays * dayMs
        ),
      }));
    if (!chat) throw new Error("The agent's conversation could not be created");
    const { messages } = await createAgentTranscriptStorage(this.db).load({
      chatId: chat.id,
      clientData: undefined,
    });
    return {
      chatId: chat.id,
      expiresAt: chat.expiresAt,
      messages,
      lastEventId: chat.lastOutEventId ?? undefined,
    };
  }

  /**
   * The chat, when it's the user's, after the privacy notice and before its
   * session expires; anyone else's is not found.
   */
  async requireOwn(
    input: { userId: string; chatId: string },
    now = new Date()
  ) {
    await this.requireNotice(input.userId);
    const chat = await new AgentChatRepository(this.db).findChat(input.chatId);
    if (chat?.userId !== input.userId) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    // An expired conversation's session can't be reopened: a reload starts
    // the next conversation.
    if (chat.expiresAt <= now) throw new TRPCError({ code: "CONFLICT" });
    return chat;
  }
}
