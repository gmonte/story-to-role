import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

import { membershipCreatedWebhook } from "@repo/api/domains/organization-memberships/webhooks/membership-created";
import { membershipDeletedWebhook } from "@repo/api/domains/organization-memberships/webhooks/membership-deleted";
import { membershipUpdatedWebhook } from "@repo/api/domains/organization-memberships/webhooks/membership-updated";
import { organizationCreatedWebhook } from "@repo/api/domains/organizations/webhooks/organization-created";
import { organizationDeletedWebhook } from "@repo/api/domains/organizations/webhooks/organization-deleted";
import { organizationUpdatedWebhook } from "@repo/api/domains/organizations/webhooks/organization-updated";
import { userCreatedWebhook } from "@repo/api/domains/users/webhooks/user-created";
import { userDeletedWebhook } from "@repo/api/domains/users/webhooks/user-deleted";
import { userUpdatedWebhook } from "@repo/api/domains/users/webhooks/user-updated";
import { logger } from "@repo/common/tools/logger";

const logTags = ["clerk", "webhooks"];

export async function POST(req: NextRequest) {
  try {
    const event = await verifyWebhook(req);

    logger.info(logTags, `Received webhook event type of ${event.type}`, event);

    switch (event.type) {
      case "user.created":
        return userCreatedWebhook(event);
      case "user.updated":
        return userUpdatedWebhook(event);
      case "user.deleted":
        return userDeletedWebhook(event);

      case "organization.created":
        return organizationCreatedWebhook(event);
      case "organization.updated":
        return organizationUpdatedWebhook(event);
      case "organization.deleted":
        return organizationDeletedWebhook(event);

      case "organizationMembership.created":
        return membershipCreatedWebhook(event);
      case "organizationMembership.updated":
        return membershipUpdatedWebhook(event);
      case "organizationMembership.deleted":
        return membershipDeletedWebhook(event);

      default:
        return new Response("Webhook received", { status: 200 });
    }
  } catch (err) {
    logger.error(logTags, "Error verifying webhook:", err);
    return new Response("Error verifying webhook", { status: 400 });
  }
}
