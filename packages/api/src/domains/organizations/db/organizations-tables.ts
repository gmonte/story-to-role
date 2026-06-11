import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { createTable } from "@repo/api/utils/db/create-table";

export const organizationsTable = createTable(
  "organizations",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),

    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
    deletedAt: d.timestamp({ withTimezone: true }),

    clerkOrganizationId: d.text().notNull(),
    name: d.text().notNull(),
    slug: d.text(),
    imageUrl: d.text(),
  }),
  (t) => [
    unique("organizations_clerk_organization_id_unique").on(
      t.clerkOrganizationId
    ),
    index("organizations_name_idx").on(t.name),
  ]
);
