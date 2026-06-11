import type { OrganizationJSON } from "@clerk/nextjs/server";

import type { organizationsTable } from "@repo/api/domains/organizations/db/organizations-tables";

export function prepareClerkOrganizationData(
  data: OrganizationJSON
): typeof organizationsTable.$inferInsert {
  return {
    clerkOrganizationId: data.id,
    name: data.name,
    slug: data.slug,
    imageUrl: data.image_url,
  };
}
