import type { Config } from "drizzle-kit";

import { env } from "@repo/common/env/web.env";

import { getDbPrefix } from "./src/utils/db/get-db-prefix";

export default {
  migrations: {
    table: `${getDbPrefix()}migrations`,
  },
  schema: "./src/db.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  tablesFilter: [`${getDbPrefix()}*`],
} satisfies Config;
