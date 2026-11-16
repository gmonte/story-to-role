import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import { CareerChatRepository } from "./career-chat-repository";
import { careerChatSettings, dayMs } from "./career-chat-settings";
import { createCareerTranscriptStorage } from "./career-transcript-storage";

/**
 * The career chat as the web app reaches it: the user's live conversation,
 * opened only after the privacy notice, and nobody else's.
 */
export class CareerChatService {
  constructor(private readonly db: DbClient) {}

  private async requireProfile(userId: string) {
    const profile = await new CareerRepository(this.db).findProfileByUserId(
      userId
    );
    if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
    return profile;
  }

  /**
   * The profile's live conversation, started when there's none (or the
   * last one's session expired), with its messages.
   */
  async current(userId: string, now = new Date()) {
    const profile = await this.requireProfile(userId);
    if (!profile.privacyNoticeAcceptedAt) {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }
    const chats = new CareerChatRepository(this.db);
    // A session about to expire isn't handed out for a new turn.
    const chat =
      (await chats.findCurrentChat(
        profile.id,
        new Date(now.getTime() + careerChatSettings.expiryMarginMs)
      )) ??
      (await chats.insertChat({
        profileId: profile.id,
        expiresAt: new Date(
          now.getTime() + careerChatSettings.retentionDays * dayMs
        ),
      }));
    if (!chat) throw new Error("Career chat could not be created");
    const { messages } = await createCareerTranscriptStorage(this.db).load({
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
    const profile = await this.requireProfile(input.userId);
    if (!profile.privacyNoticeAcceptedAt) {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }
    const chat = await new CareerChatRepository(this.db).findChat(input.chatId);
    if (chat?.profileId !== profile.id) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    // An expired conversation's session can't be reopened: a reload starts
    // the next conversation.
    if (chat.expiresAt <= now) throw new TRPCError({ code: "CONFLICT" });
    return chat;
  }
}
