import "server-only";

import type { z } from "zod";
import { createSelectSchema } from "drizzle-zod";

import { organizationMembershipsTable } from "../db/organization-memberships-tables";

export const organizationMembershipSchema = createSelectSchema(
  organizationMembershipsTable
);

export type OrganizationMembership = z.infer<
  typeof organizationMembershipSchema
>;
