import type { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";

import { organizationsTable } from "@repo/api/domains/organizations/db/organizations-tables";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

import { prepareClerkOrganizationData } from "../utils/prepare-clerk-organization-data";

export const organizationCreatedWebhook = async (
  event: Awaited<ReturnType<typeof verifyWebhook>>
) => {
  if (
    event.type !== "organization.created" &&
    event.type !== "organization.updated"
  ) {
    return new Response("Invalid event handler for organization.created", {
      status: 400,
    });
  }

  const newOrg = prepareClerkOrganizationData(event.data);

  const preExisting = await db.query.organizationsTable.findFirst({
    where: eq(
      organizationsTable.clerkOrganizationId,
      newOrg.clerkOrganizationId
    ),
  });

  if (preExisting) {
    logger.info(
      ["organization created webhook"],
      "organization already exists. updated:",
      newOrg.clerkOrganizationId
    );
    await db
      .update(organizationsTable)
      .set({ ...newOrg, deletedAt: null })
      .where(eq(organizationsTable.id, preExisting.id));
  } else {
    logger.info(
      ["organization created webhook"],
      "organization does not exist. created:",
      newOrg.clerkOrganizationId
    );
    await db.insert(organizationsTable).values(newOrg);
  }

  return new Response("Organization created", { status: 200 });
};
