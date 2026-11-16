import { z } from "zod";

import {
  sensitiveItemKindSchema,
  sensitivityChoiceSchema,
} from "@repo/api/domains/evidence/schemas/evidence";

/** A sensitive item with its general choice and this application's own. */
export const applicationOverrideItemSchema = z.object({
  sensitiveItemId: z.uuid(),
  kind: sensitiveItemKindSchema,
  original: z.string(),
  choice: sensitivityChoiceSchema.nullable(),
  generalized: z.string().nullable(),
  override: z
    .object({
      choice: sensitivityChoiceSchema,
      generalized: z.string().nullable(),
    })
    .nullable(),
});
export type ApplicationOverrideItem = z.infer<
  typeof applicationOverrideItemSchema
>;
