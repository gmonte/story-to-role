import { sql } from "drizzle-orm";
import { index } from "drizzle-orm/pg-core";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";

import type {
  ChatContext,
  ChatMessageAuthor,
  ChatMessageKind,
} from "../schemas/chat-message";

/**
 * The turns of a chat. `content` is encrypted with the user's data key
 * (privacy spec); an off-topic reply has none.
 */
export const chatMessagesTable = createTable(
  "chat_messages",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),

    userId: d
      .uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    context: d.text().$type<ChatContext>().notNull(),
    author: d.text().$type<ChatMessageAuthor>().notNull(),
    kind: d.text().$type<ChatMessageKind>().notNull().default("text"),
    encryptedContent: d.text(),
  }),
  (t) => [index("chat_messages_user_context_idx").on(t.userId, t.context)]
);
