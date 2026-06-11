import { relations } from "drizzle-orm";

import { organizationsTable } from "@repo/api/domains/organizations/db/organizations-tables";
import { usersTable } from "@repo/api/domains/users/db/users-tables";

import { organizationMembershipsTable } from "./organization-memberships-tables";

export const organizationMembershipsRelations = relations(
  organizationMembershipsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [organizationMembershipsTable.userId],
      references: [usersTable.id],
    }),
    organization: one(organizationsTable, {
      fields: [organizationMembershipsTable.organizationId],
      references: [organizationsTable.id],
    }),
  })
);
