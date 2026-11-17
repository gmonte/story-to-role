import { z } from "zod";

import { accountSources } from "./career";

/** One version of a position's account, in full. */
export const accountVersionSchema = z.object({
  accountVersionId: z.uuid(),
  version: z.number().int().nullable(),
  text: z.string(),
  doNotInclude: z.array(z.string()),
  source: z.enum(accountSources),
  // The approved version it came from (null for a first account).
  basedOnVersionId: z.uuid().nullable(),
  approvedAt: z.date().nullable(),
  createdAt: z.date(),
});

/** A position's account: the approved version, the draft, the history. */
export const accountViewSchema = z.object({
  approved: accountVersionSchema.nullable(),
  draft: accountVersionSchema.nullable(),
  // The approved versions' headers, newest first.
  versions: z.array(
    accountVersionSchema
      .pick({ accountVersionId: true, source: true })
      .extend({ version: z.number().int(), approvedAt: z.date() })
  ),
});

export const accountDraftInputSchema = z.object({
  positionId: z.uuid(),
  text: z.string().trim().min(1).max(20_000),
  doNotInclude: z.array(z.string().trim().min(1).max(200)).max(100),
});
