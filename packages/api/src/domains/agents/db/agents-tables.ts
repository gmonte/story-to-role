import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { documentsTable } from "@repo/api/domains/documents/db/documents-tables";
import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";

/** What a conversation is about: the user's profile, or one document. */
export type AgentChatSubjectKind = "profile" | "document";

/**
 * A conversation with an agent on Trigger.dev `chat.agent` (ADR 0007, ADR
 * 0009): the profile agent's (one live conversation per user) or a
 * document agent's (one per resume or cover letter). The session's runtime
 * state and stream cursors live here; its messages in the table below.
 */
export const agentChatsTable = createTable(
  "agent_chats",
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
    subject: d.text().$type<AgentChatSubjectKind>().notNull(),
    // The document a document agent's conversation is about; null for the
    // profile agent's.
    documentId: d
      .uuid()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    // The chat runtime's opaque state and stream cursors (no career content).
    encryptedState: d.text(),
    lastOutEventId: d.text(),
    lastInEventId: d.text(),
    // The session's retention deadline on Trigger.dev.
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
  }),
  (t) => [
    index("agent_chats_user_id_idx").on(t.userId),
    index("agent_chats_document_id_idx").on(t.documentId),
  ]
);

/**
 * The conversation's messages, in order, each a UI message encrypted with
 * the user's data key; purged 7 days after they were written.
 */
export const agentChatMessagesTable = createTable(
  "agent_chat_messages",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    chatId: d
      .uuid()
      .notNull()
      .references(() => agentChatsTable.id, { onDelete: "cascade" }),
    // The UI message's own id, as the chat runtime addresses it.
    messageId: d.text().notNull(),
    position: d.integer().notNull(),
    encryptedMessage: d.text().notNull(),
    // An answer cut short (a stop or a crash) stays marked across a resume.
    final: d.boolean().notNull().default(true),
  }),
  (t) => [
    unique("agent_chat_messages_chat_message_unique").on(t.chatId, t.messageId),
    index("agent_chat_messages_chat_position_idx").on(t.chatId, t.position),
  ]
);
