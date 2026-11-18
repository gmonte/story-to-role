import { and, asc, desc, eq, gt, inArray, lt, max } from "drizzle-orm";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import type { DbClient } from "@repo/api/tools/db-client";

import {
  profileChatMessagesTable,
  profileChatsTable,
} from "../db/profile-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

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
      .from(profileChatsTable)
      .where(eq(profileChatsTable.id, chatId));
    return row;
  }

  /** The user's conversation whose session hasn't expired yet. */
  async findCurrentChat(userId: string, now: Date) {
    const [row] = await this.tx
      .select()
      .from(profileChatsTable)
      .where(
        and(
          eq(profileChatsTable.userId, userId),
          gt(profileChatsTable.expiresAt, now)
        )
      )
      .orderBy(desc(profileChatsTable.createdAt))
      .limit(1);
    return row;
  }

  async insertChat(chat: Insert<typeof profileChatsTable>) {
    const [row] = await this.tx
      .insert(profileChatsTable)
      .values(chat)
      .returning();
    return row;
  }

  async updateChat(
    chatId: string,
    changes: Partial<Insert<typeof profileChatsTable>>
  ) {
    await this.tx
      .update(profileChatsTable)
      .set(changes)
      .where(eq(profileChatsTable.id, chatId));
  }

  listMessages(chatId: string) {
    return this.tx
      .select()
      .from(profileChatMessagesTable)
      .where(eq(profileChatMessagesTable.chatId, chatId))
      .orderBy(asc(profileChatMessagesTable.position));
  }

  async findMessage(chatId: string, messageId: string) {
    const [row] = await this.tx
      .select()
      .from(profileChatMessagesTable)
      .where(
        and(
          eq(profileChatMessagesTable.chatId, chatId),
          eq(profileChatMessagesTable.messageId, messageId)
        )
      );
    return row;
  }

  async lastPosition(chatId: string) {
    const [row] = await this.tx
      .select({ position: max(profileChatMessagesTable.position) })
      .from(profileChatMessagesTable)
      .where(eq(profileChatMessagesTable.chatId, chatId));
    return row?.position ?? -1;
  }

  async insertMessage(message: Insert<typeof profileChatMessagesTable>) {
    await this.tx.insert(profileChatMessagesTable).values(message);
  }

  async replaceMessage(input: {
    chatId: string;
    messageId: string;
    encryptedMessage: string;
    final: boolean;
  }) {
    await this.tx
      .update(profileChatMessagesTable)
      .set({ encryptedMessage: input.encryptedMessage, final: input.final })
      .where(
        and(
          eq(profileChatMessagesTable.chatId, input.chatId),
          eq(profileChatMessagesTable.messageId, input.messageId)
        )
      );
  }

  async deleteMessage(chatId: string, messageId: string) {
    await this.tx
      .delete(profileChatMessagesTable)
      .where(
        and(
          eq(profileChatMessagesTable.chatId, chatId),
          eq(profileChatMessagesTable.messageId, messageId)
        )
      );
  }

  async deleteMessagesAfter(chatId: string, position: number) {
    await this.tx
      .delete(profileChatMessagesTable)
      .where(
        and(
          eq(profileChatMessagesTable.chatId, chatId),
          gt(profileChatMessagesTable.position, position)
        )
      );
  }

  /** ADR 0007: the conversation goes 7 days after it was written. */
  async deleteMessagesBefore(cutoff: Date) {
    const deleted = await this.tx
      .delete(profileChatMessagesTable)
      .where(lt(profileChatMessagesTable.createdAt, cutoff))
      .returning({ id: profileChatMessagesTable.id });
    return deleted.length;
  }

  /** Conversations whose session expired before `cutoff`, with their messages. */
  async deleteChatsExpiredBefore(cutoff: Date) {
    const deleted = await this.tx
      .delete(profileChatsTable)
      .where(lt(profileChatsTable.expiresAt, cutoff))
      .returning({ id: profileChatsTable.id });
    return deleted.length;
  }

  /**
   * Ends the user's open conversations: their messages and stream state go
   * now, and their sessions count as expired, so the next one is new.
   */
  async closeOpenChats(userId: string, now: Date) {
    const open = await this.tx
      .select({ id: profileChatsTable.id })
      .from(profileChatsTable)
      .where(
        and(
          eq(profileChatsTable.userId, userId),
          gt(profileChatsTable.expiresAt, now)
        )
      );
    const ids = open.map((row) => row.id);
    if (ids.length === 0) return ids;
    await this.tx
      .delete(profileChatMessagesTable)
      .where(inArray(profileChatMessagesTable.chatId, ids));
    await this.tx
      .update(profileChatsTable)
      .set({
        expiresAt: now,
        encryptedState: null,
        lastOutEventId: null,
        lastInEventId: null,
      })
      .where(inArray(profileChatsTable.id, ids));
    return ids;
  }

  /** Every conversation of the user, for account deletion. */
  async listChatIds(userId: string) {
    const rows = await this.tx
      .select({ id: profileChatsTable.id })
      .from(profileChatsTable)
      .where(eq(profileChatsTable.userId, userId));
    return rows.map((row) => row.id);
  }
}
