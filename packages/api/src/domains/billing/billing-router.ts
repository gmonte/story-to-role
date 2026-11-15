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
        "Opens a Stripe Checkout page for the subscription or a credit pack"
      )
    )
    .input(z.object({ product: checkoutProductSchema }))
    .output(urlSchema)
    .mutation(({ ctx, input }) =>
      new BillingService(db).startCheckout({
        userId: ctx.userId,
        product: input.product,
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
    .output(z.object({ product: z.string().nullable(), paid: z.boolean() }))
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
