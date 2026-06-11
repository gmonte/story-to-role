import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@repo/common/env/web.env";

import * as schema from "../db";

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const conn =
  globalForDb.conn ??
  postgres(env.DATABASE_URL, {
    max: env.DB_MIGRATING ? 1 : undefined,
  });

if (env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, {
  schema,
  logger: false,
});

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
