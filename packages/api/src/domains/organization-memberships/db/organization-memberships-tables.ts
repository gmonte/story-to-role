import { sql } from "drizzle-orm";
import { index, unique } from "drizzle-orm/pg-core";

import { organizationsTable } from "@repo/api/domains/organizations/db/organizations-tables";
import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { createTable } from "@repo/api/utils/db/create-table";

export const organizationMembershipsTable = createTable(
  "organization_memberships",
  (d) => ({
    id: d.uuid().defaultRandom().primaryKey(),

    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
    deletedAt: d.timestamp({ withTimezone: true }),

    clerkMembershipId: d.text().notNull(),

    userId: d
      .uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    organizationId: d
      .uuid()
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),

    // The role string is opaque from our side — Clerk Organizations manages
    // permissions. Common values: "org:admin", "org:member".
    clerkRole: d.text().notNull(),
  }),
  (t) => [
    unique("organization_memberships_clerk_id_unique").on(t.clerkMembershipId),
    unique("organization_memberships_user_org_unique").on(
      t.userId,
      t.organizationId
    ),
    index("organization_memberships_user_id_idx").on(t.userId),
    index("organization_memberships_organization_id_idx").on(t.organizationId),
  ]
);
