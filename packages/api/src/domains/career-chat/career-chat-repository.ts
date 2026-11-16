import { and, asc, desc, eq, gt, inArray, lt, max } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import {
  careerChatMessagesTable,
  careerChatsTable,
} from "./db/career-chat-tables";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export class CareerChatRepository {
  constructor(private readonly tx: DbClient) {}

  async findChat(chatId: string) {
    const [row] = await this.tx
      .select()
      .from(careerChatsTable)
      .where(eq(careerChatsTable.id, chatId));
    return row;
  }

  /** The profile's conversation whose session hasn't expired yet. */
  async findCurrentChat(profileId: string, now: Date) {
    const [row] = await this.tx
      .select()
      .from(careerChatsTable)
      .where(
        and(
          eq(careerChatsTable.profileId, profileId),
          gt(careerChatsTable.expiresAt, now)
        )
      )
      .orderBy(desc(careerChatsTable.createdAt))
      .limit(1);
    return row;
  }

  async insertChat(chat: Insert<typeof careerChatsTable>) {
    const [row] = await this.tx
      .insert(careerChatsTable)
      .values(chat)
      .returning();
    return row;
  }

  async updateChat(
    chatId: string,
    changes: Partial<Insert<typeof careerChatsTable>>
  ) {
    await this.tx
      .update(careerChatsTable)
      .set(changes)
      .where(eq(careerChatsTable.id, chatId));
  }

  listMessages(chatId: string) {
    return this.tx
      .select()
      .from(careerChatMessagesTable)
      .where(eq(careerChatMessagesTable.chatId, chatId))
      .orderBy(asc(careerChatMessagesTable.position));
  }

  async findMessage(chatId: string, messageId: string) {
    const [row] = await this.tx
      .select()
      .from(careerChatMessagesTable)
      .where(
        and(
          eq(careerChatMessagesTable.chatId, chatId),
          eq(careerChatMessagesTable.messageId, messageId)
        )
      );
    return row;
  }

  async lastPosition(chatId: string) {
    const [row] = await this.tx
      .select({ position: max(careerChatMessagesTable.position) })
      .from(careerChatMessagesTable)
      .where(eq(careerChatMessagesTable.chatId, chatId));
    return row?.position ?? -1;
  }

  async insertMessage(message: Insert<typeof careerChatMessagesTable>) {
    await this.tx.insert(careerChatMessagesTable).values(message);
  }

  async replaceMessage(input: {
    chatId: string;
    messageId: string;
    encryptedMessage: string;
    final: boolean;
  }) {
    await this.tx
      .update(careerChatMessagesTable)
      .set({ encryptedMessage: input.encryptedMessage, final: input.final })
      .where(
        and(
          eq(careerChatMessagesTable.chatId, input.chatId),
          eq(careerChatMessagesTable.messageId, input.messageId)
        )
      );
  }

  async deleteMessage(chatId: string, messageId: string) {
    await this.tx
      .delete(careerChatMessagesTable)
      .where(
        and(
          eq(careerChatMessagesTable.chatId, chatId),
          eq(careerChatMessagesTable.messageId, messageId)
        )
      );
  }

  async deleteMessagesAfter(chatId: string, position: number) {
    await this.tx
      .delete(careerChatMessagesTable)
      .where(
        and(
          eq(careerChatMessagesTable.chatId, chatId),
          gt(careerChatMessagesTable.position, position)
        )
      );
  }

  /** Privacy spec: the conversation goes 7 days after it was written. */
  async deleteMessagesBefore(cutoff: Date) {
    const deleted = await this.tx
      .delete(careerChatMessagesTable)
      .where(lt(careerChatMessagesTable.createdAt, cutoff))
      .returning({ id: careerChatMessagesTable.id });
    return deleted.length;
  }

  /** Conversations whose session expired before `cutoff`, with their messages. */
  async deleteChatsExpiredBefore(cutoff: Date) {
    const deleted = await this.tx
      .delete(careerChatsTable)
      .where(lt(careerChatsTable.expiresAt, cutoff))
      .returning({ id: careerChatsTable.id });
    return deleted.length;
  }

  /** Every conversation of the profiles, for account deletion. */
  async listChatIds(profileIds: string[]) {
    if (profileIds.length === 0) return [];
    const rows = await this.tx
      .select({ id: careerChatsTable.id })
      .from(careerChatsTable)
      .where(inArray(careerChatsTable.profileId, profileIds));
    return rows.map((row) => row.id);
  }
}
