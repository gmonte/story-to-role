import { relations } from "drizzle-orm";

import { organizationMembershipsTable } from "@repo/api/domains/organization-memberships/db/organization-memberships-tables";

import { organizationsTable } from "./organizations-tables";

export const organizationsRelations = relations(
  organizationsTable,
  ({ many }) => ({
    memberships: many(organizationMembershipsTable),
  })
);
