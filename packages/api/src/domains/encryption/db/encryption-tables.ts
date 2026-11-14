import { sql } from "drizzle-orm";
import { unique } from "drizzle-orm/pg-core";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";

/**
 * Each user's data key, wrapped by the master key of `masterKeyVersion`.
 * Deleting the row crypto-shreds the user: their encrypted content, backups
 * included, can no longer be read.
 */
export const userDataKeysTable = createTable(
  "user_data_keys",
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
    wrappedKey: d.text().notNull(),
    masterKeyVersion: d.integer().notNull(),
  }),
  (t) => [unique("user_data_keys_user_id_unique").on(t.userId)]
);
