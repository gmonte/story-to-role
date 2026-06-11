import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { createTable } from "@repo/api/utils/db/create-table";

export const usersTable = createTable(
  "users",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),

    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
    deletedAt: d.timestamp({ withTimezone: true }),

    clerkUserId: d.text().notNull(),
    email: d.text().notNull(),
    firstName: d.text().notNull(),
    lastName: d.text().notNull(),
    fullName: d.text().notNull(),
    imageUrl: d.text(),
    username: d.text(),
  }),
  (t) => [
    unique("users_clerk_user_id_unique").on(t.clerkUserId),
    index("users_full_name_idx").on(t.fullName),
    index("users_email_idx").on(t.email),
  ]
);
