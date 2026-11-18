import { and, asc, desc, eq, gt, inArray, isNull, lt, max } from "drizzle-orm";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import type { DbClient } from "@repo/api/tools/db-client";

import { agentChatMessagesTable, agentChatsTable } from "./db/agents-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

/**
 * What a conversation is about (ADR 0009): the user's profile, or one of
 * their documents.
 */
export type AgentChatSubject =
  | { kind: "profile" }
  | { kind: "document"; documentId: string };

export type AgentChat = typeof agentChatsTable.$inferSelect;

/** The rows of a subject: the profile's, or one document's. */
function subjectIs(subject: AgentChatSubject) {
  return subject.kind === "profile"
    ? and(
        eq(agentChatsTable.subject, "profile"),
        isNull(agentChatsTable.documentId)
      )
    : and(
        eq(agentChatsTable.subject, "document"),
        eq(agentChatsTable.documentId, subject.documentId)
      );
}

/** A chat's subject, as its row says. */
export function subjectOf(chat: AgentChat): AgentChatSubject {
  return chat.subject === "document" && chat.documentId
    ? { kind: "document", documentId: chat.documentId }
    : { kind: "profile" };
}

export class AgentChatRepository {
  constructor(private readonly tx: DbClient) {}

  /** Holds the user's row for the rest of the transaction. */
  async lockUser(userId: string) {
    await this.tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update");
  }

  async findChat(chatId: string) {
    const [row] = await this.tx
      .select()
      .from(agentChatsTable)
      .where(eq(agentChatsTable.id, chatId));
    return row;
  }

  /** The user's conversation on a subject whose session hasn't expired yet. */
  async findCurrentChat(userId: string, subject: AgentChatSubject, now: Date) {
    const [row] = await this.tx
      .select()
      .from(agentChatsTable)
      .where(
        and(
          eq(agentChatsTable.userId, userId),
          subjectIs(subject),
          gt(agentChatsTable.expiresAt, now)
        )
      )
      .orderBy(desc(agentChatsTable.createdAt))
      .limit(1);
    return row;
  }

  async insertChat(chat: Insert<typeof agentChatsTable>) {
    const [row] = await this.tx
      .insert(agentChatsTable)
      .values(chat)
      .returning();
    return row;
  }

  async updateChat(
    chatId: string,
    changes: Partial<Insert<typeof agentChatsTable>>
  ) {
    await this.tx
      .update(agentChatsTable)
      .set(changes)
      .where(eq(agentChatsTable.id, chatId));
  }

  listMessages(chatId: string) {
    return this.tx
      .select()
      .from(agentChatMessagesTable)
      .where(eq(agentChatMessagesTable.chatId, chatId))
      .orderBy(asc(agentChatMessagesTable.position));
  }

  async findMessage(chatId: string, messageId: string) {
    const [row] = await this.tx
      .select()
      .from(agentChatMessagesTable)
      .where(
        and(
          eq(agentChatMessagesTable.chatId, chatId),
          eq(agentChatMessagesTable.messageId, messageId)
        )
      );
    return row;
  }

  async lastPosition(chatId: string) {
    const [row] = await this.tx
      .select({ position: max(agentChatMessagesTable.position) })
      .from(agentChatMessagesTable)
      .where(eq(agentChatMessagesTable.chatId, chatId));
    return row?.position ?? -1;
  }

  async insertMessage(message: Insert<typeof agentChatMessagesTable>) {
    await this.tx.insert(agentChatMessagesTable).values(message);
  }

  async replaceMessage(input: {
    chatId: string;
    messageId: string;
    encryptedMessage: string;
    final: boolean;
  }) {
    await this.tx
      .update(agentChatMessagesTable)
      .set({ encryptedMessage: input.encryptedMessage, final: input.final })
      .where(
        and(
          eq(agentChatMessagesTable.chatId, input.chatId),
          eq(agentChatMessagesTable.messageId, input.messageId)
        )
      );
  }

  async deleteMessage(chatId: string, messageId: string) {
    await this.tx
      .delete(agentChatMessagesTable)
      .where(
        and(
          eq(agentChatMessagesTable.chatId, chatId),
          eq(agentChatMessagesTable.messageId, messageId)
        )
      );
  }

  async deleteMessagesAfter(chatId: string, position: number) {
    await this.tx
      .delete(agentChatMessagesTable)
      .where(
        and(
          eq(agentChatMessagesTable.chatId, chatId),
          gt(agentChatMessagesTable.position, position)
        )
      );
  }

  /** ADR 0007: the conversation goes 7 days after it was written. */
  async deleteMessagesBefore(cutoff: Date) {
    const deleted = await this.tx
      .delete(agentChatMessagesTable)
      .where(lt(agentChatMessagesTable.createdAt, cutoff))
      .returning({ id: agentChatMessagesTable.id });
    return deleted.length;
  }

  /** Conversations whose session expired before `cutoff`, with their messages. */
  async deleteChatsExpiredBefore(cutoff: Date) {
    const deleted = await this.tx
      .delete(agentChatsTable)
      .where(lt(agentChatsTable.expiresAt, cutoff))
      .returning({ id: agentChatsTable.id });
    return deleted.length;
  }

  /**
   * Ends the user's open conversations on a subject: their messages and
   * stream state go now, and their sessions count as expired, so the next
   * one is new.
   */
  async closeOpenChats(userId: string, subject: AgentChatSubject, now: Date) {
    const open = await this.tx
      .select({ id: agentChatsTable.id })
      .from(agentChatsTable)
      .where(
        and(
          eq(agentChatsTable.userId, userId),
          subjectIs(subject),
          gt(agentChatsTable.expiresAt, now)
        )
      );
    const ids = open.map((row) => row.id);
    if (ids.length === 0) return ids;
    await this.tx
      .delete(agentChatMessagesTable)
      .where(inArray(agentChatMessagesTable.chatId, ids));
    await this.tx
      .update(agentChatsTable)
      .set({
        expiresAt: now,
        encryptedState: null,
        lastOutEventId: null,
        lastInEventId: null,
      })
      .where(inArray(agentChatsTable.id, ids));
    return ids;
  }

  /** Every conversation of the user, for account deletion. */
  async listChatIds(userId: string) {
    const rows = await this.tx
      .select({ id: agentChatsTable.id })
      .from(agentChatsTable)
      .where(eq(agentChatsTable.userId, userId));
    return rows.map((row) => row.id);
  }
}
