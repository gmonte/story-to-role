import { z } from "zod";

import { db } from "@repo/api/tools/db";
import { openApiMeta } from "@repo/api/tools/openapi";
import {
  createTRPCRouter,
  rateLimited,
  userProcedure,
} from "@repo/api/tools/trpc";
import { getBaseUrl } from "@repo/common/utils/get-base-url";

import { BillingService } from "./billing-service";
import { billingStatusSchema, checkoutProductSchema } from "./schemas/billing";

const urlSchema = z.object({ url: z.string() });

export const billingRouter = createTRPCRouter({
  status: userProcedure
    .meta(
      openApiMeta(
        "billing",
        "GET",
        "/billing",
        "Returns the user's subscription as Stripe last reported it"
      )
    )
    .input(z.object({}))
    .output(billingStatusSchema)
    .query(({ ctx }) => new BillingService(db).status(ctx.userId)),

  startCheckout: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "billing",
        "POST",
        "/billing/checkout",
        "Opens a Stripe Checkout page for a subscription or a credit pack; the own-key subscription needs the key"
      )
    )
    .input(
      z.object({
        product: checkoutProductSchema,
        apiKey: z.string().trim().min(20).max(300).optional(),
      })
    )
    .output(urlSchema)
    .mutation(({ ctx, input }) =>
      new BillingService(db).startCheckout({
        userId: ctx.userId,
        product: input.product,
        apiKey: input.apiKey,
        baseUrl: getBaseUrl(),
      })
    ),

  switchToCredits: userProcedure
    .use(rateLimited("taskStart"))
    .meta(
      openApiMeta(
        "billing",
        "POST",
        "/billing/switch-to-credits",
        "Moves an own-key subscriber to the credit subscription now"
      )
    )
    .input(z.object({}))
    .output(z.object({ applied: z.boolean() }))
    .mutation(({ ctx }) =>
      new BillingService(db).switchToCredits({ userId: ctx.userId })
    ),

  changeInterval: userProcedure
    .meta(
      openApiMeta(
        "billing",
        "POST",
        "/billing/change-interval",
        "Opens the Stripe Customer Portal to switch between monthly and annual"
      )
    )
    .input(z.object({}))
    .output(urlSchema)
    .mutation(({ ctx }) =>
      new BillingService(db).changeInterval({
        userId: ctx.userId,
        baseUrl: getBaseUrl(),
      })
    ),

  completeCheckout: userProcedure
    .meta(
      openApiMeta(
        "billing",
        "POST",
        "/billing/checkout/by-id/{checkoutSessionId}/complete",
        "Grants what a finished Checkout bought, on return from Stripe"
      )
    )
    .input(z.object({ checkoutSessionId: z.string().startsWith("cs_") }))
    .output(
      z.object({
        product: checkoutProductSchema.nullable(),
        paid: z.boolean(),
      })
    )
    .mutation(({ ctx, input }) =>
      new BillingService(db).completeCheckout({
        userId: ctx.userId,
        checkoutSessionId: input.checkoutSessionId,
      })
    ),

  portal: userProcedure
    .meta(
      openApiMeta(
        "billing",
        "POST",
        "/billing/portal",
        "Opens the Stripe Customer Portal"
      )
    )
    .input(z.object({}))
    .output(urlSchema)
    .mutation(({ ctx }) =>
      new BillingService(db).portal({
        userId: ctx.userId,
        baseUrl: getBaseUrl(),
      })
    ),
});
