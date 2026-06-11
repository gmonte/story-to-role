import { env } from "@repo/common/env/web.env";

export function getDbPrefix(): string {
  return env.DATABASE_DB_PREFIX ?? "";
}
