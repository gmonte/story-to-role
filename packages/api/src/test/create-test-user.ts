import { grantCredits } from "@repo/api/domains/credits/credit-ledger";
import { usersTable } from "@repo/api/domains/users/db/users-tables";

import { getTestDatabase } from "./pglite";

/**
 * A local user, as the Clerk webhook would have created it, with enough
 * stored credits that tests about something else never run out (tests of
 * the ledger pass `credits: 0`).
 */
export async function createTestUser(
  email = "ada@example.com",
  { credits = 100_000 }: { credits?: number } = {}
) {
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
  if (credits > 0) {
    await grantCredits(db, {
      userId: user.id,
      source: "pack",
      amount: credits,
      origin: `test:${user.id}`,
      expiresAt: null,
    });
  }
  return user;
}
