import type { JwtSessionClaims } from "../src/domains/users/schemas/jwt-session-claims";

export {};

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type
  interface CustomJwtSessionClaims extends JwtSessionClaims {}
}
