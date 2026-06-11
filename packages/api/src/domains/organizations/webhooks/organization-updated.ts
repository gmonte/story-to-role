import type { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";

import { organizationsTable } from "@repo/api/domains/organizations/db/organizations-tables";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

import { prepareClerkOrganizationData } from "../utils/prepare-clerk-organization-data";
import { organizationCreatedWebhook } from "./organization-created";

export const organizationUpdatedWebhook = async (
  event: Awaited<ReturnType<typeof verifyWebhook>>
) => {
  if (event.type !== "organization.updated") {
    return new Response("Invalid event handler for organization.updated", {
      status: 400,
    });
  }

  if (!event.data.id) {
    return new Response("Invalid organization id", { status: 400 });
  }

  const result = await db
    .update(organizationsTable)
    .set(prepareClerkOrganizationData(event.data))
    .where(eq(organizationsTable.clerkOrganizationId, event.data.id));

  if (result.count === 0) {
    logger.info(
      ["organization updated webhook"],
      "organization not found:",
      event.data.id
    );
    return await organizationCreatedWebhook(event);
  }

  logger.info(
    ["organization updated webhook"],
    "organization updated:",
    event.data.id
  );
  return new Response("Organization updated", { status: 200 });
};
