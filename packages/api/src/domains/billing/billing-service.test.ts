import type Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { spendableTotal } from "@repo/api/domains/credits/credit-ledger";
import { subscriptionMonth } from "@repo/api/domains/credits/credit-plan";
import { CreditsService } from "@repo/api/domains/credits/credits-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { BillingRepository } from "./billing-repository";
import { BillingService, type StripeGateway } from "./billing-service";

vi.mock("@repo/api/tools/stripe/stripe-client", () => ({
  getStripe: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));

const day = 24 * 3600;
const nowSeconds = Math.floor(Date.now() / 1000);

function subscription(status: Stripe.Subscription.Status = "active") {
  return {
    id: "sub_1",
    status,
    cancel_at_period_end: false,
    items: {
      data: [
        {
          price: { recurring: { interval: "month" } },
          current_period_start: nowSeconds - 2 * day,
          current_period_end: nowSeconds + 28 * day,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function packSession(id = "cs_pack_1") {
  return {
    id,
    mode: "payment",
    payment_status: "paid",
    customer: "cus_ada",
    created: nowSeconds,
    metadata: { product: "pack" },
    subscription: null,
  } as unknown as Stripe.Checkout.Session;
}

function fakeStripe(state: {
  subscription?: Stripe.Subscription;
  sessions?: Stripe.Checkout.Session[];
}) {
  return {
    subscriptions: {
      retrieve: vi.fn(async () => state.subscription ?? subscription()),
      list: vi.fn(async () => ({
        data: state.subscription ? [state.subscription] : [],
      })),
    },
    checkout: {
      sessions: {
        retrieve: vi.fn(async (sessionId: string) =>
          state.sessions?.find((session) => session.id === sessionId)
        ),
        list: vi.fn(async () => ({ data: state.sessions ?? [] })),
      },
    },
  } as unknown as StripeGateway;
}

const event = (type: string, object: object) =>
  ({ id: "evt_1", type, data: { object } }) as unknown as Stripe.Event;

async function setup(state: Parameters<typeof fakeStripe>[0] = {}) {
  const db = await getTestDatabase();
  const user = await createTestUser("ada@example.com", { credits: 0 });
  await new BillingRepository(db).insertCustomer({
    userId: user.id,
    stripeCustomerId: "cus_ada",
  });
  const stripe = fakeStripe(state);
  return {
    db,
    user,
    stripe,
    billing: new BillingService(db, stripe),
    spendable: () => spendableTotal(db, user.id, "any", new Date()),
  };
}

describe("billing service", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("grants the month's credits once for a paid invoice", async () => {
    const ctx = await setup({ subscription: subscription() });
    const paid = event("invoice.paid", {
      customer: "cus_ada",
      parent: { subscription_details: { subscription: "sub_1" } },
    });

    expect(await ctx.billing.handleEvent(paid)).toEqual({ handled: true });
    await ctx.billing.handleEvent(paid);

    expect(await ctx.spendable()).toBe(600);
    const summary = await new CreditsService(ctx.db).summary(ctx.user.id);
    expect(summary.plan).toBe("subscription");
    expect(summary.reserve).toBe(0);
  });

  it("grants nothing while the subscription is unpaid", async () => {
    const ctx = await setup({ subscription: subscription("past_due") });
    await ctx.billing.handleEvent(
      event("invoice.payment_failed", {
        customer: "cus_ada",
        parent: { subscription_details: { subscription: "sub_1" } },
      })
    );

    expect((await ctx.billing.status(ctx.user.id)).subscription?.status).toBe(
      "past_due"
    );
    expect(await ctx.spendable()).toBe(0);
  });

  it("grants a pack once, from the webhook or the return from Checkout", async () => {
    const session = packSession();
    const ctx = await setup({ sessions: [session] });

    await ctx.billing.handleEvent(event("checkout.session.completed", session));
    await ctx.billing.completeCheckout({
      userId: ctx.user.id,
      checkoutSessionId: session.id,
    });

    expect(await ctx.spendable()).toBe(300);
  });

  it("refuses another user's Checkout session", async () => {
    const ctx = await setup({
      sessions: [{ ...packSession(), customer: "cus_grace" }],
    });

    await expect(
      ctx.billing.completeCheckout({
        userId: ctx.user.id,
        checkoutSessionId: "cs_pack_1",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("ignores events of customers from other environments", async () => {
    const ctx = await setup();
    expect(
      await ctx.billing.handleEvent(
        event("checkout.session.completed", {
          ...packSession(),
          customer: "cus_elsewhere",
        })
      )
    ).toEqual({ handled: false });
  });

  it("takes back a refunded pack", async () => {
    const session = packSession();
    const ctx = await setup({ sessions: [session] });
    await ctx.billing.handleEvent(event("checkout.session.completed", session));

    await ctx.billing.handleEvent(
      event("charge.refunded", {
        customer: "cus_ada",
        refunded: true,
        payment_intent: "pi_1",
      })
    );

    expect(await ctx.spendable()).toBe(0);
  });

  it("reconciles a missed webhook without duplicating grants", async () => {
    const ctx = await setup({
      subscription: subscription(),
      sessions: [packSession()],
    });

    await ctx.billing.reconcile();
    await ctx.billing.reconcile();

    const summary = await new CreditsService(ctx.db).summary(ctx.user.id);
    expect(summary.available).toBe(900);
    // A subscriber's pack waits for their confirmation.
    expect(await ctx.spendable()).toBe(600);
  });
});

describe("subscription month", () => {
  it("splits an annual subscription into months from its start", () => {
    const year = {
      interval: "year" as const,
      currentPeriodStart: new Date("2026-03-10T00:00:00Z"),
      currentPeriodEnd: new Date("2027-03-10T00:00:00Z"),
    };
    expect(subscriptionMonth(year, new Date("2026-11-15T00:00:00Z"))).toEqual({
      start: new Date("2026-11-10T00:00:00Z"),
      end: new Date("2026-12-10T00:00:00Z"),
    });
    expect(subscriptionMonth(year, new Date("2027-03-01T00:00:00Z"))).toEqual({
      start: new Date("2027-02-10T00:00:00Z"),
      end: new Date("2027-03-10T00:00:00Z"),
    });
  });
});
