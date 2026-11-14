import { and, asc, eq } from "drizzle-orm";

import type { DbClient } from "@repo/api/tools/db-client";

import type { ChatContext } from "./schemas/chat-message";
import { chatMessagesTable } from "./db/chat-tables";

export class ChatRepository {
  constructor(private readonly tx: DbClient) {}

  async insert(message: typeof chatMessagesTable.$inferInsert) {
    const [row] = await this.tx
      .insert(chatMessagesTable)
      .values(message)
      .returning();
    return row;
  }

  async findForUser(input: { chatMessageId: string; userId: string }) {
    const [row] = await this.tx
      .select()
      .from(chatMessagesTable)
      .where(
        and(
          eq(chatMessagesTable.id, input.chatMessageId),
          eq(chatMessagesTable.userId, input.userId)
        )
      );
    return row;
  }

  listForUser(input: { userId: string; context: ChatContext }) {
    return this.tx
      .select()
      .from(chatMessagesTable)
      .where(
        and(
          eq(chatMessagesTable.userId, input.userId),
          eq(chatMessagesTable.context, input.context)
        )
      )
      .orderBy(asc(chatMessagesTable.createdAt));
  }
}
