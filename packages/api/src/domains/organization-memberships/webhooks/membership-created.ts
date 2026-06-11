import type { verifyWebhook } from "@clerk/nextjs/webhooks";
import { and, eq } from "drizzle-orm";

import { organizationMembershipsTable } from "@repo/api/domains/organization-memberships/db/organization-memberships-tables";
import { organizationsTable } from "@repo/api/domains/organizations/db/organizations-tables";
import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

import { prepareClerkMembershipData } from "../utils/prepare-clerk-membership-data";

export const membershipCreatedWebhook = async (
  event: Awaited<ReturnType<typeof verifyWebhook>>
) => {
  if (
    event.type !== "organizationMembership.created" &&
    event.type !== "organizationMembership.updated"
  ) {
    return new Response(
      "Invalid event handler for organizationMembership.created",
      { status: 400 }
    );
  }

  const prepared = prepareClerkMembershipData(event.data);

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, prepared.clerkUserId),
  });
  const organization = await db.query.organizationsTable.findFirst({
    where: eq(
      organizationsTable.clerkOrganizationId,
      prepared.clerkOrganizationId
    ),
  });

  if (!user || !organization) {
    logger.warn(
      ["membership created webhook"],
      "missing user or organization — webhook may have arrived out of order",
      { user: prepared.clerkUserId, organization: prepared.clerkOrganizationId }
    );
    return new Response("Missing user or organization", { status: 409 });
  }

  const preExisting = await db.query.organizationMembershipsTable.findFirst({
    where: and(
      eq(organizationMembershipsTable.userId, user.id),
      eq(organizationMembershipsTable.organizationId, organization.id)
    ),
  });

  if (preExisting) {
    await db
      .update(organizationMembershipsTable)
      .set({
        clerkMembershipId: prepared.clerkMembershipId,
        clerkRole: prepared.clerkRole,
        deletedAt: null,
      })
      .where(eq(organizationMembershipsTable.id, preExisting.id));
    logger.info(
      ["membership created webhook"],
      "membership already exists. updated:",
      prepared.clerkMembershipId
    );
  } else {
    await db.insert(organizationMembershipsTable).values({
      clerkMembershipId: prepared.clerkMembershipId,
      clerkRole: prepared.clerkRole,
      userId: user.id,
      organizationId: organization.id,
    });
    logger.info(
      ["membership created webhook"],
      "membership created:",
      prepared.clerkMembershipId
    );
  }

  return new Response("Membership created", { status: 200 });
};
