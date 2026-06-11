import type { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";

import { organizationMembershipsTable } from "@repo/api/domains/organization-memberships/db/organization-memberships-tables";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

export const membershipDeletedWebhook = async (
  event: Awaited<ReturnType<typeof verifyWebhook>>
) => {
  if (event.type !== "organizationMembership.deleted") {
    return new Response(
      "Invalid event handler for organizationMembership.deleted",
      { status: 400 }
    );
  }

  if (!event.data.id) {
    return new Response("Invalid membership id", { status: 400 });
  }

  await db
    .delete(organizationMembershipsTable)
    .where(eq(organizationMembershipsTable.clerkMembershipId, event.data.id));

  logger.info(
    ["membership deleted webhook"],
    "membership deleted:",
    event.data.id
  );
  return new Response("Membership deleted", { status: 200 });
};
