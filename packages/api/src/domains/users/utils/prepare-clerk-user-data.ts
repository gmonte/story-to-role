import type { UserJSON } from "@clerk/nextjs/server";

import type { usersTable } from "@repo/api/domains/users/db/users-tables";

export function prepareClerkUserData(
  data: UserJSON
): typeof usersTable.$inferInsert {
  const email = data.email_addresses.find(
    ({ id }) => id === data.primary_email_address_id
  )?.email_address;

  const firstName = data.first_name ?? "";
  const lastName = data.last_name ?? "";

  return {
    clerkUserId: data.id,
    email: email ?? "",
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" "),
    imageUrl: data.image_url,
    username: data.username,
  };
}
