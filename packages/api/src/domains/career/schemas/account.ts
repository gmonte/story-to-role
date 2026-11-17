import { z } from "zod";

import { accountSources } from "./career";

const versionSchema = z.object({
  accountVersionId: z.uuid(),
  version: z.number().int().nullable(),
  text: z.string(),
  doNotInclude: z.array(z.string()),
  source: z.enum(accountSources),
  approvedAt: z.date().nullable(),
  createdAt: z.date(),
});

/** A position's account: the approved version, the draft, the history. */
export const accountViewSchema = z.object({
  approved: versionSchema.nullable(),
  draft: versionSchema.nullable(),
  versions: z.array(
    z.object({
      accountVersionId: z.uuid(),
      version: z.number().int(),
      source: z.enum(accountSources),
      approvedAt: z.date(),
    })
  ),
});

export const accountVersionSchema = versionSchema;

export const accountDraftInputSchema = z.object({
  positionId: z.uuid(),
  text: z.string().trim().min(1).max(20_000),
  doNotInclude: z.array(z.string().trim().min(1).max(200)).max(100),
});
