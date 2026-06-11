import { z } from "zod";

/**
 * Clerk JWT custom session claims for this app. Populated from the Clerk
 * dashboard JWT template — set `userInternalId` to `{{user.public_metadata.userInternalId}}`
 * once the `user.created` webhook has stored it.
 */
export const jwtSessionClaimsSchema = z.object({
  userInternalId: z.uuid().optional(),
});

export type JwtSessionClaims = z.infer<typeof jwtSessionClaimsSchema>;
