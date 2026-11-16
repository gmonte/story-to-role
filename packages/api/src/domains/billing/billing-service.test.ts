import type Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { spendableTotal } from "@repo/api/domains/credits/credit-ledger";
import { paidMonth } from "@repo/api/domains/credits/credit-plan";
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

function subscription(
  status: Stripe.Subscription.Status = "active",
  invoiceStatus: Stripe.Invoice.Status = "paid"
) {
  const period = { start: nowSeconds - 2 * day, end: nowSeconds + 28 * day };
  return {
    id: "sub_1",
    status,
    cancel_at_period_end: false,
    latest_invoice: {
      id: "in_1",
      status: invoiceStatus,
      lines: {
        data: [{ parent: { type: "subscription_item_details" }, period }],
      },
    },
    items: {
      data: [
        {
          price: { recurring: { interval: "month" } },
          current_period_start: period.start,
          current_period_end: period.end,
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

/** A Stripe list: its first page, or every page. */
const list = <T>(data: T[]) => ({
  data,
  autoPagingToArray: async () => data,
});

function fakeStripe(state: {
  subscription?: Stripe.Subscription;
  sessions?: Stripe.Checkout.Session[];
  invoiceOfPayment?: string;
}) {
  return {
    subscriptions: {
      retrieve: vi.fn(async () => state.subscription ?? subscription()),
      list: vi.fn(() => list(state.subscription ? [state.subscription] : [])),
      cancel: vi.fn(async () => ({})),
    },
    checkout: {
      sessions: {
        retrieve: vi.fn(async (sessionId: string) =>
          state.sessions?.find((session) => session.id === sessionId)
        ),
        list: vi.fn(() => list(state.sessions ?? [])),
      },
    },
    customers: { del: vi.fn(async () => ({ deleted: true })) },
    invoicePayments: {
      list: vi.fn(async () =>
        list(
          state.invoiceOfPayment ? [{ invoice: state.invoiceOfPayment }] : []
        )
      ),
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

  it("grants nothing until the invoice is paid, yet keeps the paid plan", async () => {
    const ctx = await setup({ subscription: subscription("past_due", "open") });
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
    const summary = await new CreditsService(ctx.db).summary(ctx.user.id);
    expect(summary.plan).toBe("subscription");
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

  it("takes back a refunded invoice's monthly credits", async () => {
    const ctx = await setup({
      subscription: subscription(),
      invoiceOfPayment: "in_1",
    });
    await ctx.billing.handleEvent(
      event("customer.subscription.updated", {
        id: "sub_1",
        customer: "cus_ada",
      })
    );
    expect(await ctx.spendable()).toBe(600);

    await ctx.billing.handleEvent(
      event("charge.refunded", {
        customer: "cus_ada",
        refunded: true,
        payment_intent: "pi_sub",
      })
    );
    // Syncing again doesn't bring them back.
    await ctx.billing.reconcile();

    expect(await ctx.spendable()).toBe(0);
  });

  it("cancels subscriptions and deletes the customer with the account", async () => {
    const ctx = await setup({ subscription: subscription() });
    await ctx.billing.removeForDeletion(ctx.user.id);
    expect(vi.mocked(ctx.stripe.customers).del.mock.calls[0]).toEqual([
      "cus_ada",
    ]);
    expect(vi.mocked(ctx.stripe.subscriptions).cancel.mock.calls[0]).toEqual([
      "sub_1",
    ]);
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

describe("paid month", () => {
  const year = {
    start: new Date("2026-03-10T00:00:00Z"),
    end: new Date("2027-03-10T00:00:00Z"),
  };

  it("splits an annual invoice into months from its start", () => {
    expect(paidMonth(year, new Date("2026-11-15T00:00:00Z"))).toEqual({
      start: new Date("2026-11-10T00:00:00Z"),
      end: new Date("2026-12-10T00:00:00Z"),
    });
    expect(paidMonth(year, new Date("2027-03-01T00:00:00Z"))).toEqual({
      start: new Date("2027-02-10T00:00:00Z"),
      end: new Date("2027-03-10T00:00:00Z"),
    });
    expect(paidMonth(year, new Date("2027-03-11T00:00:00Z"))).toBeNull();
  });

  it("keeps month-end starts at the month's end", () => {
    const fromJan31 = {
      start: new Date("2027-01-31T00:00:00Z"),
      end: new Date("2028-01-31T00:00:00Z"),
    };
    expect(paidMonth(fromJan31, new Date("2027-03-01T00:00:00Z"))).toEqual({
      start: new Date("2027-02-28T00:00:00Z"),
      end: new Date("2027-03-31T00:00:00Z"),
    });
  });
});
