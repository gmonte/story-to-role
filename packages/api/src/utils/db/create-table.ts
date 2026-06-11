import { pgTableCreator } from "drizzle-orm/pg-core";

import { getDbPrefix } from "./get-db-prefix";

/**
 * Use the same database instance for multiple projects via prefix.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `${getDbPrefix()}${name}`);
