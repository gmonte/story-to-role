import { TRPCError } from "@trpc/server";
import type Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AiKeysRepository } from "@repo/api/domains/ai/ai-keys-repository";
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
  invoiceStatus: Stripe.Invoice.Status = "paid",
  product = "storytorole_subscription",
  id = "sub_1",
  interval: "month" | "year" = "month"
) {
  const period = {
    start: nowSeconds - 2 * day,
    end: nowSeconds + (interval === "year" ? 363 : 28) * day,
  };
  return {
    id,
    status,
    cancel_at_period_end: false,
    latest_invoice: {
      id: id.replace("sub_", "in_"),
      status: invoiceStatus,
      lines: {
        data: [{ parent: { type: "subscription_item_details" }, period }],
      },
    },
    items: {
      data: [
        {
          id: "si_1",
          price: { product, recurring: { interval } },
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
  subscriptions?: Record<string, Stripe.Subscription>;
  sessions?: Stripe.Checkout.Session[];
  invoiceOfPayment?: string;
  // What a subscription becomes once updated.
  updated?: Stripe.Subscription;
}) {
  return {
    subscriptions: {
      retrieve: vi.fn(
        async (subscriptionId: string) =>
          state.subscriptions?.[subscriptionId] ??
          state.subscription ??
          subscription()
      ),
      list: vi.fn(() => list(state.subscription ? [state.subscription] : [])),
      cancel: vi.fn(async () => ({})),
      update: vi.fn(async (subscriptionId: string) => {
        if (state.updated) {
          state.subscriptions = {
            ...state.subscriptions,
            [subscriptionId]: state.updated,
          };
        }
        return state.updated;
      }),
    },
    prices: {
      list: vi.fn(async ({ lookup_keys }: { lookup_keys: string[] }) => ({
        data: [{ id: `price_${lookup_keys[0]}` }],
      })),
    },
    checkout: {
      sessions: {
        retrieve: vi.fn(async (sessionId: string) =>
          state.sessions?.find((session) => session.id === sessionId)
        ),
        list: vi.fn(() => list(state.sessions ?? [])),
        create: vi.fn(async () => ({ url: "https://checkout.stripe.test" })),
      },
    },
    billingPortal: {
      configurations: {
        list: vi.fn(async () => ({
          data: [
            { id: "bpc_default", is_default: true, active: true, metadata: {} },
            {
              id: "bpc_changes",
              is_default: false,
              active: true,
              metadata: { purpose: "interval_change" },
            },
          ],
        })),
      },
      sessions: {
        create: vi.fn(async () => ({ url: "https://portal.stripe.test" })),
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

const apiKey = "sk-ant-api03-test-key-0123456789abcdefWXYZ";

async function setup(state: Parameters<typeof fakeStripe>[0] = {}) {
  const db = await getTestDatabase();
  const user = await createTestUser("ada@example.com", { credits: 0 });
  await new BillingRepository(db).insertCustomer({
    userId: user.id,
    stripeCustomerId: "cus_ada",
  });
  const stripe = fakeStripe(state);
  // The key check the own-key Checkout runs first (AiKeysService.store).
  const keys = {
    store: vi.fn(async () => ({ status: "active" as const })),
  };
  return {
    db,
    user,
    stripe,
    keys,
    billing: new BillingService(db, stripe, keys),
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

  it("puts an own-key subscriber on that plan, with Free's monthly fit checks only", async () => {
    const ctx = await setup({
      subscription: subscription("active", "paid", "storytorole_own_key"),
    });
    await ctx.billing.handleEvent(
      event("invoice.paid", {
        customer: "cus_ada",
        parent: { subscription_details: { subscription: "sub_1" } },
      })
    );

    const summary = await new CreditsService(ctx.db).summary(ctx.user.id);
    expect(summary.plan).toBe("own_key");
    expect(await ctx.spendable()).toBe(0);
    expect(
      await spendableTotal(ctx.db, ctx.user.id, "fit_check", new Date())
    ).toBe(10);
    expect((await ctx.billing.status(ctx.user.id)).subscription?.plan).toBe(
      "own_key"
    );
  });

  it("deletes the key when the own-key plan ends, unless a courtesy grant uses it", async () => {
    const ended = subscription("canceled", "paid", "storytorole_own_key");
    const ctx = await setup({ subscription: ended });
    const keys = new AiKeysRepository(ctx.db);
    const keep = () =>
      keys.upsert({
        userId: ctx.user.id,
        encryptedKey: "encrypted",
        lastCharacters: "WXYZ",
        status: "active",
        now: new Date(),
      });
    const deleted = event("customer.subscription.deleted", {
      id: "sub_1",
      customer: "cus_ada",
    });

    await keep();
    await ctx.billing.handleEvent(deleted);
    expect(await keys.findByUserId(ctx.user.id)).toBeNull();

    const owner = await createTestUser("owner@example.com", { credits: 0 });
    await new CreditsService(ctx.db).grantCourtesy({
      adminUserId: owner.id,
      email: "ada@example.com",
      monthlyCredits: 0,
      endsAt: null,
    });
    await keep();
    await ctx.billing.handleEvent(deleted);
    expect(await keys.findByUserId(ctx.user.id)).not.toBeNull();
  });

  it("opens the own-key Checkout only with a key the provider accepts", async () => {
    const ctx = await setup();
    ctx.keys.store.mockRejectedValueOnce(
      new TRPCError({ code: "BAD_REQUEST" })
    );
    const start = () =>
      ctx.billing.startCheckout({
        userId: ctx.user.id,
        product: "own_key_monthly",
        apiKey,
        baseUrl: "https://app.test",
      });

    await expect(start()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      vi.mocked(ctx.stripe.checkout.sessions).create.mock.calls
    ).toHaveLength(0);
    await expect(
      ctx.billing.startCheckout({
        userId: ctx.user.id,
        product: "own_key_monthly",
        baseUrl: "https://app.test",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(await start()).toEqual({ url: "https://checkout.stripe.test" });
    expect(ctx.keys.store).toHaveBeenCalledWith({
      userId: ctx.user.id,
      apiKey,
    });
    expect(
      vi.mocked(ctx.stripe.checkout.sessions).create.mock.calls
    ).toContainEqual([
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_own_key_monthly_v1", quantity: 1 }],
        metadata: { userId: ctx.user.id, product: "own_key_monthly" },
      }),
    ]);
  });

  it("moves a credit subscriber to the own key once it is paid, keeping the year's credits", async () => {
    const annual = subscription(
      "active",
      "paid",
      "storytorole_subscription",
      "sub_credit",
      "year"
    );
    const ownKey = subscription(
      "active",
      "paid",
      "storytorole_own_key",
      "sub_key",
      "year"
    );
    const session = {
      id: "cs_key",
      mode: "subscription",
      payment_status: "paid",
      customer: "cus_ada",
      subscription: "sub_key",
      metadata: {
        userId: "",
        product: "own_key_annual",
        replaces: "sub_credit",
      },
    } as unknown as Stripe.Checkout.Session;
    const ctx = await setup({
      subscriptions: { sub_credit: annual, sub_key: ownKey },
      sessions: [session],
    });
    await ctx.billing.handleEvent(
      event("customer.subscription.updated", {
        id: "sub_credit",
        customer: "cus_ada",
      })
    );
    expect(await ctx.spendable()).toBe(600);

    await ctx.billing.startCheckout({
      userId: ctx.user.id,
      product: "own_key_annual",
      apiKey,
      baseUrl: "https://app.test",
    });
    expect(
      vi.mocked(ctx.stripe.checkout.sessions).create.mock.calls
    ).toContainEqual([
      expect.objectContaining({
        metadata: {
          userId: ctx.user.id,
          product: "own_key_annual",
          replaces: "sub_credit",
        },
      }),
    ]);
    // Nothing changes until the new plan is paid.
    expect(vi.mocked(ctx.stripe.subscriptions).cancel.mock.calls).toHaveLength(
      0
    );

    const complete = () =>
      ctx.billing.completeCheckout({
        userId: ctx.user.id,
        checkoutSessionId: "cs_key",
      });
    await complete();
    await complete();

    expect(vi.mocked(ctx.stripe.subscriptions).cancel.mock.calls).toHaveLength(
      1
    );
    expect(
      vi.mocked(ctx.stripe.subscriptions).cancel.mock.calls
    ).toContainEqual([
      "sub_credit",
      {
        prorate: false,
        invoice_now: false,
      },
    ]);
    const summary = await new CreditsService(ctx.db).summary(ctx.user.id);
    expect(summary.plan).toBe("own_key");
    expect(await ctx.spendable()).toBe(600);
    expect(
      (await ctx.billing.status(ctx.user.id)).carryoverEndsAt?.getTime()
    ).toBe(Number(annual.items.data[0]?.current_period_end) * 1000);
    // The year paid for still grants its months.
    const later = new Date(Date.now() + 40 * day * 1000);
    await new CreditsService(ctx.db).summary(ctx.user.id, later);
    expect(
      await spendableTotal(ctx.db, ctx.user.id, "any", later)
    ).toBeGreaterThanOrEqual(600);
  });

  it("refuses a second Checkout for the plan the user already has", async () => {
    const ctx = await setup({
      subscription: subscription("active", "paid", "storytorole_own_key"),
    });
    await ctx.billing.handleEvent(
      event("customer.subscription.updated", {
        id: "sub_1",
        customer: "cus_ada",
      })
    );

    for (const product of [
      "own_key_monthly",
      "subscription_monthly",
    ] as const) {
      await expect(
        ctx.billing.startCheckout({
          userId: ctx.user.id,
          product,
          apiKey,
          baseUrl: "https://app.test",
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    }
  });

  it("switches an own-key subscriber to credits now, restarting the period", async () => {
    const credits = subscription("active", "paid");
    // The switch's invoice credits the unused own-key time first.
    (credits.latest_invoice as Stripe.Invoice).lines.data.unshift({
      parent: {
        type: "subscription_item_details",
        subscription_item_details: { proration: true },
      },
      period: { start: nowSeconds - 30 * day, end: nowSeconds - 2 * day },
    } as unknown as Stripe.InvoiceLineItem);
    const ctx = await setup({
      subscription: subscription("active", "paid", "storytorole_own_key"),
      updated: credits,
    });
    await ctx.billing.handleEvent(
      event("customer.subscription.updated", {
        id: "sub_1",
        customer: "cus_ada",
      })
    );
    const keys = new AiKeysRepository(ctx.db);
    await keys.upsert({
      userId: ctx.user.id,
      encryptedKey: "encrypted",
      lastCharacters: "WXYZ",
      status: "active",
      now: new Date(),
    });

    await ctx.billing.switchToCredits({ userId: ctx.user.id });

    expect(
      vi.mocked(ctx.stripe.subscriptions).update.mock.calls
    ).toContainEqual([
      "sub_1",
      {
        items: [{ id: "si_1", price: "price_subscription_monthly_v1" }],
        billing_cycle_anchor: { type: "now" },
        proration_behavior: "always_invoice",
        payment_behavior: "pending_if_incomplete",
      },
    ]);
    const summary = await new CreditsService(ctx.db).summary(ctx.user.id);
    expect(summary.plan).toBe("subscription");
    expect(await ctx.spendable()).toBe(600);
    expect(await keys.findByUserId(ctx.user.id)).toBeNull();
    // Only an own-key subscriber switches this way.
    await expect(
      ctx.billing.switchToCredits({ userId: ctx.user.id })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("opens the portal to switch between monthly and annual within the plan", async () => {
    const ctx = await setup({ subscription: subscription() });
    await ctx.billing.handleEvent(
      event("customer.subscription.updated", {
        id: "sub_1",
        customer: "cus_ada",
      })
    );

    expect(
      await ctx.billing.changeInterval({
        userId: ctx.user.id,
        baseUrl: "https://app.test",
      })
    ).toEqual({ url: "https://portal.stripe.test" });
    expect(
      vi.mocked(ctx.stripe.billingPortal.sessions).create.mock.calls
    ).toContainEqual([
      {
        customer: "cus_ada",
        configuration: "bpc_changes",
        return_url: "https://app.test/app/billing",
        flow_data: {
          type: "subscription_update_confirm",
          subscription_update_confirm: {
            subscription: "sub_1",
            items: [{ id: "si_1", price: "price_subscription_annual_v1" }],
          },
          after_completion: {
            type: "redirect",
            redirect: { return_url: "https://app.test/app/billing" },
          },
        },
      },
    ]);
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
