import { usersTable } from "@repo/api/domains/users/db/users-tables";

import { getTestDatabase } from "./pglite";

/** A local user, as the Clerk webhook would have created it. */
export async function createTestUser(email = "ada@example.com") {
  const db = await getTestDatabase();
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `clerk_${email}`,
      email,
      firstName: "",
      lastName: "",
      fullName: "",
    })
    .returning();
  return user;
}
