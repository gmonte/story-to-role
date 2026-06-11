import "server-only";

import type { z } from "zod";
import { createSelectSchema } from "drizzle-zod";

import { usersTable } from "../db/users-tables";

export const userSchema = createSelectSchema(usersTable);

export type User = z.infer<typeof userSchema>;
