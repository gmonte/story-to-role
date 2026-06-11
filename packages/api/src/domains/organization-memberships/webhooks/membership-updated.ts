import type { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";

import { organizationMembershipsTable } from "@repo/api/domains/organization-memberships/db/organization-memberships-tables";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

import { prepareClerkMembershipData } from "../utils/prepare-clerk-membership-data";
import { membershipCreatedWebhook } from "./membership-created";

export const membershipUpdatedWebhook = async (
  event: Awaited<ReturnType<typeof verifyWebhook>>
) => {
  if (event.type !== "organizationMembership.updated") {
    return new Response(
      "Invalid event handler for organizationMembership.updated",
      { status: 400 }
    );
  }

  const prepared = prepareClerkMembershipData(event.data);

  const result = await db
    .update(organizationMembershipsTable)
    .set({ clerkRole: prepared.clerkRole })
    .where(
      eq(
        organizationMembershipsTable.clerkMembershipId,
        prepared.clerkMembershipId
      )
    );

  if (result.count === 0) {
    logger.info(
      ["membership updated webhook"],
      "membership not found:",
      prepared.clerkMembershipId
    );
    return await membershipCreatedWebhook(event);
  }

  logger.info(
    ["membership updated webhook"],
    "membership updated:",
    prepared.clerkMembershipId
  );
  return new Response("Membership updated", { status: 200 });
};
