import type { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

import { prepareClerkUserData } from "../utils/prepare-clerk-user-data";
import { userCreatedWebhook } from "./user-created";

export const userUpdatedWebhook = async (
  event: Awaited<ReturnType<typeof verifyWebhook>>
) => {
  if (event.type !== "user.updated") {
    return new Response("Invalid event handler for user.updated", {
      status: 400,
    });
  }

  if (!event.data.id) {
    return new Response("Invalid user id", { status: 400 });
  }

  const result = await db
    .update(usersTable)
    .set(prepareClerkUserData(event.data))
    .where(eq(usersTable.clerkUserId, event.data.id));

  if (result.count === 0) {
    logger.info(["user updated webhook"], "user not found:", event.data.id);
    return await userCreatedWebhook(event);
  }

  logger.info(["user updated webhook"], "user updated userId:", event.data.id);
  return new Response("User updated", { status: 200 });
};
