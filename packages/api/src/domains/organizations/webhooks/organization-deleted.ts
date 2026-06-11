import type { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";

import { organizationsTable } from "@repo/api/domains/organizations/db/organizations-tables";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

export const organizationDeletedWebhook = async (
  event: Awaited<ReturnType<typeof verifyWebhook>>
) => {
  if (event.type !== "organization.deleted") {
    return new Response("Invalid event handler for organization.deleted", {
      status: 400,
    });
  }

  if (!event.data.id) {
    return new Response("Invalid organization id", { status: 400 });
  }

  await db
    .update(organizationsTable)
    .set({ deletedAt: new Date() })
    .where(eq(organizationsTable.clerkOrganizationId, event.data.id));

  logger.info(
    ["organization deleted webhook"],
    "organization deleted:",
    event.data.id
  );
  return new Response("Organization deleted", { status: 200 });
};
