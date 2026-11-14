import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as schema from "../db";

/**
 * What repositories accept: the app database, a transaction of it, or the
 * PGlite database in tests (all share drizzle's Postgres query builder).
 */
export type DbClient = PgDatabase<PgQueryResultHKT, typeof schema>;
