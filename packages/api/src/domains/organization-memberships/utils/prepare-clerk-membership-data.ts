import type { OrganizationMembershipJSON } from "@clerk/nextjs/server";

export type PreparedMembership = {
  clerkMembershipId: string;
  clerkUserId: string;
  clerkOrganizationId: string;
  clerkRole: string;
};

export function prepareClerkMembershipData(
  data: OrganizationMembershipJSON
): PreparedMembership {
  return {
    clerkMembershipId: data.id,
    clerkUserId: data.public_user_data?.user_id ?? "",
    clerkOrganizationId: data.organization.id,
    clerkRole: data.role,
  };
}
