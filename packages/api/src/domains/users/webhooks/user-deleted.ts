import type { verifyWebhook } from "@clerk/nextjs/webhooks";

import { AccountService } from "@repo/api/domains/account/account-service";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

/**
 * Clerk deleted the user, from our "Delete account" or its own interface:
 * everything StoryToRole holds for them goes too (privacy spec).
 */
export const userDeletedWebhook = async (
  event: Awaited<ReturnType<typeof verifyWebhook>>
) => {
  if (event.type !== "user.deleted") {
    return new Response("Invalid event handler for user.deleted", {
      status: 400,
    });
  }

  if (!event.data.id) {
    return new Response("Invalid user id", { status: 400 });
  }

  await new AccountService(db).deleteByClerkUser(event.data.id);

  logger.info(["user deleted webhook"], "user deleted userId:", event.data.id);
  return new Response("User deleted", { status: 200 });
};
