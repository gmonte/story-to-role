import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { careerProfilesTable } from "@repo/api/domains/career/db/career-tables";
import { createTable } from "@repo/api/utils/db/create-table";

/**
 * The single career conversation of a profile (guided-interview spec, "one
 * conversation"). Its id is the chat id the Trigger.dev session is keyed on;
 * the agent finds the user through this row, never through what the browser
 * sends. A new row starts once the session behind the current one expires.
 */
export const careerChatsTable = createTable(
  "career_chats",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),

    profileId: d
      .uuid()
      .notNull()
      .references(() => careerProfilesTable.id, { onDelete: "cascade" }),
    // The chat runtime's opaque state and stream cursors (no career content).
    encryptedState: d.text(),
    lastOutEventId: d.text(),
    lastInEventId: d.text(),
    // The session's retention deadline on Trigger.dev.
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
  }),
  (t) => [index("career_chats_profile_idx").on(t.profileId)]
);

/**
 * The conversation's messages, in order, each a UI message encrypted with
 * the user's data key. Draft facts keep pointing at the position sessions'
 * turns, so these are purged like transcripts.
 */
export const careerChatMessagesTable = createTable(
  "career_chat_messages",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),

    chatId: d
      .uuid()
      .notNull()
      .references(() => careerChatsTable.id, { onDelete: "cascade" }),
    // The UI message's own id, as the chat runtime addresses it.
    messageId: d.text().notNull(),
    position: d.integer().notNull(),
    encryptedMessage: d.text().notNull(),
    // An answer cut short (a stop or a crash) stays marked across a resume.
    final: d.boolean().notNull().default(true),
  }),
  (t) => [
    unique("career_chat_messages_chat_message_unique").on(
      t.chatId,
      t.messageId
    ),
    index("career_chat_messages_chat_position_idx").on(t.chatId, t.position),
  ]
);
