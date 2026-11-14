import { relations } from "drizzle-orm";

import { usersTable } from "./users-tables";

export const usersRelations = relations(usersTable, () => ({}));
