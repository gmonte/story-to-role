import { clerkClient } from "@clerk/nextjs/server";
import type { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq, or } from "drizzle-orm";

import { usersTable } from "@repo/api/domains/users/db/users-tables";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

import { prepareClerkUserData } from "../utils/prepare-clerk-user-data";

export const userCreatedWebhook = async (
  event: Awaited<ReturnType<typeof verifyWebhook>>
) => {
  if (event.type !== "user.created" && event.type !== "user.updated") {
    return new Response("Invalid event handler for user.created", {
      status: 400,
    });
  }

  const newUser = prepareClerkUserData(event.data);
  const client = await clerkClient();

  const preExistingUser = await db.query.usersTable.findFirst({
    where: or(
      eq(usersTable.clerkUserId, newUser.clerkUserId),
      eq(usersTable.email, newUser.email)
    ),
  });

  let userInternalId: string;

  if (preExistingUser) {
    logger.info(
      ["user created webhook"],
      "user already exists. updated userId:",
      newUser.clerkUserId
    );
    await db
      .update(usersTable)
      .set({ ...newUser, deletedAt: null })
      .where(eq(usersTable.id, preExistingUser.id));
    userInternalId = preExistingUser.id;
  } else {
    logger.info(
      ["user created webhook"],
      "user does not exist. created userId:",
      newUser.clerkUserId
    );
    const [createdUser] = await db
      .insert(usersTable)
      .values(newUser)
      .returning();
    userInternalId = createdUser.id;
  }

  // Mirror our internal id back to Clerk public metadata so it can be embedded
  // in the JWT via the dashboard session-token template.
  await client.users.updateUserMetadata(newUser.clerkUserId, {
    publicMetadata: { userInternalId },
  });

  return new Response("User created", { status: 200 });
};
