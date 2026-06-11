import { relations } from "drizzle-orm";

import { organizationMembershipsTable } from "@repo/api/domains/organization-memberships/db/organization-memberships-tables";

import { usersTable } from "./users-tables";

export const usersRelations = relations(usersTable, ({ many }) => ({
  memberships: many(organizationMembershipsTable),
}));
