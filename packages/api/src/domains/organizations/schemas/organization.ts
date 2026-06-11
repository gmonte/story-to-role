import "server-only";

import type { z } from "zod";
import { createSelectSchema } from "drizzle-zod";

import { organizationsTable } from "../db/organizations-tables";

export const organizationSchema = createSelectSchema(organizationsTable);

export type Organization = z.infer<typeof organizationSchema>;
