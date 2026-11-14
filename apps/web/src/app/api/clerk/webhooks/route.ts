import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

import { userCreatedWebhook } from "@repo/api/domains/users/webhooks/user-created";
import { userDeletedWebhook } from "@repo/api/domains/users/webhooks/user-deleted";
import { userUpdatedWebhook } from "@repo/api/domains/users/webhooks/user-updated";
import { logger } from "@repo/common/tools/logger";

const logTags = ["clerk", "webhooks"];

export async function POST(req: NextRequest) {
  try {
    const event = await verifyWebhook(req);

    // Never log the payload: it carries personal data (name, email).
    logger.info(logTags, `Received webhook event type of ${event.type}`, {
      id: "id" in event.data ? event.data.id : undefined,
    });

    switch (event.type) {
      case "user.created":
        return userCreatedWebhook(event);
      case "user.updated":
        return userUpdatedWebhook(event);
      case "user.deleted":
        return userDeletedWebhook(event);

      default:
        return new Response("Webhook received", { status: 200 });
    }
  } catch (err) {
    logger.error(logTags, "Error verifying webhook:", err);
    return new Response("Error verifying webhook", { status: 400 });
  }
}
