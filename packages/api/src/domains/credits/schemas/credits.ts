import { z } from "zod";

import { aiKeyStatusSchema } from "@repo/api/domains/ai/schemas/ai-keys";

/**
 * Where a lot of credits comes from (billing spec, "Credit ledger"). Plan
 * lots (the month's free, courtesy or subscription credits) are spent
 * first and expire at the end of the month; stored lots (welcome credits,
 * packs) after them.
 */
export const creditSourceSchema = z.enum([
  "welcome",
  "monthly_free",
  "courtesy",
  "subscription",
  "pack",
]);
export type CreditSource = z.infer<typeof creditSourceSchema>;

export const planSources: CreditSource[] = [
  "monthly_free",
  "courtesy",
  "subscription",
];

/** What a lot may pay for: anything, or fit checks only (Free's monthly). */
export const creditScopeSchema = z.enum(["any", "fit_check"]);
export type CreditScope = z.infer<typeof creditScopeSchema>;

/** An append-only ledger entry; a lot's balance is the sum of its entries. */
export const creditEntryKindSchema = z.enum([
  "grant",
  "reserve",
  "release",
  "debit",
  "refund",
]);
export type CreditEntryKind = z.infer<typeof creditEntryKindSchema>;

export const creditSummarySchema = z.object({
  // Free, or the paid plan through a subscription or a courtesy grant.
  plan: z.enum(["free", "subscription", "courtesy"]),
  // What the user can still spend now, plan and stored credits together.
  available: z.number().int(),
  reserved: z.number().int(),
  lots: z.array(
    z.object({
      source: creditSourceSchema,
      scope: creditScopeSchema,
      remaining: z.number().int(),
      expiresAt: z.date().nullable(),
    })
  ),
  // The resume the user came for (billing spec, "Credit reserve").
  reserve: z.number().int(),
  // The balance approaches the reserve: the interview wraps up.
  nearReserve: z.boolean(),
  // "Up to N credits" for the usual actions: the resume at the user's
  // usual choices (their last resume's, else Quick and standard); its
  // `resumeBase` is at Quick and standard, which the dialogs scale.
  estimates: z.object({
    resume: z.number().int(),
    resumeBase: z.number().int(),
    coverLetter: z.number().int(),
    linkedin: z.number().int(),
    fitCheck: z.number().int(),
    adaptation: z.number().int(),
    reReview: z.number().int(),
    research: z.number().int(),
    styleProfile: z.number().int(),
    motivationTurn: z.number().int(),
    agentMessage: z.number().int(),
    sourceImport: z.number().int(),
  }),
  courtesy: z
    .object({ monthlyCredits: z.number().int(), endsAt: z.date().nullable() })
    .nullable(),
  // Key funding (billing spec, "Credit meter"): what the user's key spent
  // this month, as an estimate; credits stand as a reserve.
  key: z
    .object({
      status: aiKeyStatusSchema,
      paysNext: z.boolean(),
      spentThisMonthUsd: z.number(),
      // What finishing the task the key stopped may cost in credits.
      stoppedTaskEstimate: z.number().int().nullable(),
    })
    .nullable(),
  // On a paid plan: stored credits waiting for "Finish with credits".
  storedLocked: z.number().int(),
});
export type CreditSummary = z.infer<typeof creditSummarySchema>;

/** A courtesy grant as the admin page lists it. */
export const courtesyGrantSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  monthlyCredits: z.number().int(),
  endsAt: z.date().nullable(),
  endedAt: z.date().nullable(),
  createdAt: z.date(),
  active: z.boolean(),
});
export type CourtesyGrant = z.infer<typeof courtesyGrantSchema>;
