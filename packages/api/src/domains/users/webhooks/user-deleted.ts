import type { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

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

  await db
    .update(usersTable)
    .set({ deletedAt: new Date() })
    .where(eq(usersTable.clerkUserId, event.data.id));

  logger.info(["user deleted webhook"], "user deleted userId:", event.data.id);
  return new Response("User deleted", { status: 200 });
};
