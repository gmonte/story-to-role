import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { DocumentsRepository } from "@repo/api/domains/documents/documents-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import {
  AgentChatRepository,
  subjectOf,
  type AgentChatSubject,
} from "./agent-chat-repository";
import { agentSettings, dayMs } from "./agent-settings";
import { createAgentTranscriptStorage } from "./agent-transcript-storage";

/** The Trigger.dev task that holds a subject's conversations. */
export const agentTaskOf = (subject: AgentChatSubject) =>
  subject.kind === "profile" ? "profile_agent" : "document_agent";

/**
 * An agent's conversation as the web app reaches it (ADR 0007, ADR 0009):
 * the user's live one on a subject (their profile, or one of their
 * documents), opened only after the privacy notice, and nobody else's.
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
    return profile;
  }

  /** A document subject is one of the user's own documents. */
  private async requireSubject(userId: string, subject: AgentChatSubject) {
    const profile = await this.requireNotice(userId);
    if (subject.kind === "document") {
      const document = await new DocumentsRepository(this.db).findDocument(
        subject.documentId
      );
      if (document?.profileId !== profile.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
    }
  }

  /**
   * The user's live conversation on the subject, started when there's none
   * (or the last one's session expired), with its messages.
   */
  async current(
    userId: string,
    subject: AgentChatSubject = { kind: "profile" },
    now = new Date()
  ) {
    await this.requireSubject(userId, subject);
    // Under a lock on the user: two tabs opening at once share one chat.
    const chat = await this.db.transaction(async (tx) => {
      const chats = new AgentChatRepository(tx);
      await chats.lockUser(userId);
      // A session about to expire isn't handed out for a new turn.
      return (
        (await chats.findCurrentChat(
          userId,
          subject,
          new Date(now.getTime() + agentSettings.expiryMarginMs)
        )) ??
        (await chats.insertChat({
          userId,
          subject: subject.kind,
          documentId: subject.kind === "document" ? subject.documentId : null,
          expiresAt: new Date(
            now.getTime() + agentSettings.retentionDays * dayMs
          ),
        }))
      );
    });
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
   * Ends the user's conversation on the subject: its messages are deleted
   * now and the next `current()` is a new one. The profile or the document,
   * their suggestions and the findings are not touched. Returns the ended
   * chats, whose runs the caller cancels.
   */
  async startNew(
    userId: string,
    subject: AgentChatSubject = { kind: "profile" },
    now = new Date()
  ) {
    await this.requireSubject(userId, subject);
    const closedChatIds = await this.db.transaction(async (tx) => {
      const chats = new AgentChatRepository(tx);
      await chats.lockUser(userId);
      return chats.closeOpenChats(userId, subject, now);
    });
    return { closedChatIds, ...(await this.current(userId, subject, now)) };
  }

  /**
   * The chat, when it's the user's, after the privacy notice and before its
   * session expires; anyone else's is not found. Its subject says which
   * agent holds it.
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
    return { ...chat, task: agentTaskOf(subjectOf(chat)) };
  }
}
