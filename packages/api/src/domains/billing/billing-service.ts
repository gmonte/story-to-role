import { clerkClient } from "@clerk/nextjs/server";
import { TRPCError } from "@trpc/server";
import type Stripe from "stripe";

import { AiKeysRepository } from "@repo/api/domains/ai/ai-keys-repository";
import {
  ensureMonthlyCredits,
  grantCredits,
  invoiceOrigin,
  packOrigin,
  revokeLots,
} from "@repo/api/domains/credits/credit-ledger";
import { AiKeysService } from "@repo/api/domains/ai/ai-keys-service";
import { currentPlan } from "@repo/api/domains/credits/credit-plan";
import { creditSettings } from "@repo/api/domains/credits/credit-pricing";
import { UsersRepository } from "@repo/api/domains/users/users-repository";
import type { DbClient } from "@repo/api/tools/db-client";
import { getStripe } from "@repo/api/tools/stripe/stripe-client";
import { logger } from "@repo/common/tools/logger";

import { billingCatalog, planOfProduct } from "./billing-catalog";
import { BillingRepository } from "./billing-repository";
import {
  type BillingStatus,
  type CheckoutProduct,
  checkoutProductSchema,
  isLiveSubscription,
  type SubscriptionStatus,
} from "./schemas/billing";

const logTags = ["billing"];

/** What the service needs from Stripe (tests replace it). */
export type StripeGateway = Pick<
  Stripe,
  | "customers"
  | "checkout"
  | "billingPortal"
  | "subscriptions"
  | "prices"
  | "invoicePayments"
>;

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);

/**
 * The service period an invoice paid for: its subscription line's, never
 * a proration's (a switch's invoice credits the old plan's unused time).
 */
function paidPeriod(invoice: Stripe.Invoice) {
  const line = invoice.lines.data.find(
    (row) =>
      row.parent?.type === "subscription_item_details" &&
      !row.parent.subscription_item_details?.proration
  );
  const period = line?.period ?? invoice.lines.data[0]?.period;
  return period
    ? {
        start: new Date(period.start * 1000),
        end: new Date(period.end * 1000),
      }
    : null;
}

/**
 * Payments through Stripe (billing spec, "Payments"): Checkout for the
 * subscription and packs, the Customer Portal, and the grants their events
 * bring. Every grant is keyed by its Stripe origin, so a webhook, the
 * return from Checkout and reconciliation can all deliver it; the first
 * grants, the others change nothing.
 */
export class BillingService {
  constructor(
    private readonly db: DbClient,
    private readonly stripe: StripeGateway = getStripe(),
    // The key check the own-key Checkout runs first (tests replace it).
    private readonly keys: Pick<AiKeysService, "store"> = new AiKeysService(db)
  ) {}

  async status(userId: string): Promise<BillingStatus> {
    const repository = new BillingRepository(this.db);
    const subscription = await repository.findSubscriptionByUserId(userId);
    return {
      subscription: subscription && {
        plan: subscription.plan,
        status: subscription.status,
        interval: subscription.interval,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      carryoverEndsAt:
        (await repository.findCarryover(userId, new Date()))?.paidPeriodEnd ??
        null,
      hasCustomer: !!(await repository.findCustomerByUserId(userId)),
    };
  }

  /**
   * A Stripe Checkout page for a subscription or a pack. The own-key
   * subscription opens only with a key the provider accepts, saved first;
   * from the credit subscription it is the switch (billing spec, "Switching
   * plans"), which cancels the old one once the new one is paid.
   */
  async startCheckout(input: {
    userId: string;
    product: CheckoutProduct;
    apiKey?: string;
    baseUrl: string;
  }) {
    const price = billingCatalog.prices[input.product];
    const subscribing = price.product !== "pack";
    const ownKey = price.product === "own_key";
    let replaces: string | null = null;
    if (subscribing) {
      const current = await new BillingRepository(this.db).findLiveSubscription(
        input.userId,
        new Date()
      );
      if (current && ownKey && current.plan === "credits") {
        replaces = current.stripeSubscriptionId;
      } else if (current) {
        // One subscription: other changes have their own paths.
        throw new TRPCError({ code: "CONFLICT" });
      }
    }
    if (ownKey) {
      if (!input.apiKey) throw new TRPCError({ code: "BAD_REQUEST" });
      await this.keys.store({ userId: input.userId, apiKey: input.apiKey });
    }
    const stripePrice = await this.priceId(input.product);
    const customer = await this.customerFor(input.userId);
    const metadata = {
      userId: input.userId,
      product: input.product,
      ...(replaces ? { replaces } : {}),
    };
    const session = await this.stripe.checkout.sessions.create({
      mode: subscribing ? "subscription" : "payment",
      customer,
      client_reference_id: input.userId,
      line_items: [{ price: stripePrice, quantity: 1 }],
      metadata,
      ...(subscribing
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata } }),
      success_url: `${input.baseUrl}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${input.baseUrl}/app/billing`,
    });
    if (!session.url) throw new Error("Checkout returned no URL");
    return { url: session.url };
  }

  /**
   * The return from Checkout (billing spec: previews have no webhook): the
   * session is retrieved from Stripe and its credits granted right away,
   * with the same origin a webhook would use.
   */
  async completeCheckout(input: { userId: string; checkoutSessionId: string }) {
    const session = await this.stripe.checkout.sessions.retrieve(
      input.checkoutSessionId
    );
    const customer = await new BillingRepository(this.db).findCustomerByUserId(
      input.userId
    );
    if (idOf(session.customer) !== customer?.stripeCustomerId) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    await this.applyCheckout(session, customer.userId);
    const product = checkoutProductSchema.safeParse(session.metadata?.product);
    return {
      product: product.success ? product.data : null,
      paid: session.payment_status !== "unpaid",
    };
  }

  /**
   * Billing spec, "Switching plans": an own-key subscriber moves to the
   * credit subscription at once, the period restarting now and the unused
   * own-key time credited on the invoice. If the payment doesn't go
   * through, Stripe keeps the subscription as it was.
   */
  async switchToCredits(input: { userId: string }) {
    const current = await new BillingRepository(this.db).findLiveSubscription(
      input.userId,
      new Date()
    );
    if (current?.plan !== "own_key") {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }
    const item = await this.itemOf(current.stripeSubscriptionId);
    const price = await this.priceId(
      current.interval === "year"
        ? "subscription_annual"
        : "subscription_monthly"
    );
    const params: Stripe.SubscriptionUpdateParams = {
      items: [{ id: item.id, price }],
      billing_cycle_anchor: { type: "now" },
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
    };
    const updated = await this.stripe.subscriptions.update(
      current.stripeSubscriptionId,
      params
    );
    await this.syncSubscription(current.stripeSubscriptionId, input.userId);
    return { applied: !updated.pending_update };
  }

  /**
   * Monthly ↔ annual within the same subscription, confirmed in the
   * Customer Portal on its interval-change configuration: a longer
   * interval applies at once, a shorter one at the period's end.
   */
  async changeInterval(input: { userId: string; baseUrl: string }) {
    const repository = new BillingRepository(this.db);
    const current = await repository.findLiveSubscription(
      input.userId,
      new Date()
    );
    const customer = await repository.findCustomerByUserId(input.userId);
    if (!current || !customer) {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }
    const item = await this.itemOf(current.stripeSubscriptionId);
    const target: CheckoutProduct =
      current.plan === "own_key"
        ? current.interval === "year"
          ? "own_key_monthly"
          : "own_key_annual"
        : current.interval === "year"
          ? "subscription_monthly"
          : "subscription_annual";
    const configuration = (
      await this.stripe.billingPortal.configurations.list({ limit: 100 })
    ).data.find(
      (row) =>
        row.active &&
        row.metadata?.purpose === billingCatalog.intervalChangePortal
    );
    if (!configuration) {
      throw new Error(
        "The interval-change portal is missing: run stripe:setup"
      );
    }
    const returnUrl = `${input.baseUrl}/app/billing`;
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      configuration: configuration.id,
      return_url: returnUrl,
      flow_data: {
        type: "subscription_update_confirm",
        subscription_update_confirm: {
          subscription: current.stripeSubscriptionId,
          items: [{ id: item.id, price: await this.priceId(target) }],
        },
        after_completion: {
          type: "redirect",
          redirect: { return_url: returnUrl },
        },
      },
    });
    return { url: session.url };
  }

  /** The Customer Portal: card, invoices, cancelling. */
  async portal(input: { userId: string; baseUrl: string }) {
    const customer = await new BillingRepository(this.db).findCustomerByUserId(
      input.userId
    );
    if (!customer) throw new TRPCError({ code: "PRECONDITION_FAILED" });
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: `${input.baseUrl}/app/billing`,
    });
    return { url: session.url };
  }

  /**
   * A webhook event. Events of customers this environment doesn't know are
   * ignored: every non-production environment shares one sandbox.
   */
  async handleEvent(event: Stripe.Event) {
    const object = event.data.object as { customer?: unknown };
    const stripeCustomerId = idOf(
      object.customer as string | { id: string } | null
    );
    const customer =
      stripeCustomerId &&
      (await new BillingRepository(this.db).findCustomerByStripeId(
        stripeCustomerId
      ));
    if (!customer) return { handled: false };

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await this.applyCheckout(event.data.object, customer.userId);
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const subscriptionId = idOf(
          event.data.object.parent?.subscription_details?.subscription
        );
        if (subscriptionId) {
          await this.syncSubscription(subscriptionId, customer.userId);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        // Events may arrive out of order: Stripe's current state wins.
        await this.syncSubscription(event.data.object.id, customer.userId);
        break;
      case "charge.refunded":
        await this.applyRefund(event.data.object, customer.userId);
        break;
      default:
        // checkout.session.async_payment_failed: nothing was granted.
        return { handled: false };
    }
    return { handled: true };
  }

  /**
   * Billing spec, "Webhooks are a shortcut; reconciliation is the
   * guarantee": renewals, cancellations, packs and refunds of the Stripe
   * customers in this environment's database, rebuilt idempotently.
   */
  async reconcile() {
    const customers = await new BillingRepository(this.db).listCustomers();
    for (const customer of customers) {
      try {
        const subscriptions = await this.stripe.subscriptions
          .list({ customer: customer.stripeCustomerId, status: "all" })
          .autoPagingToArray({ limit: 100 });
        for (const subscription of subscriptions) {
          await this.syncSubscription(subscription.id, customer.userId);
        }
        const sessions = await this.stripe.checkout.sessions
          .list({
            customer: customer.stripeCustomerId,
            status: "complete",
            expand: ["data.payment_intent.latest_charge"],
          })
          .autoPagingToArray({ limit: 1000 });
        for (const session of sessions) {
          // A switch to the own-key plan whose return and webhook were lost.
          const replaces = session.metadata?.replaces;
          if (replaces && session.payment_status === "paid") {
            await this.endReplaced(replaces, customer.userId);
          }
          if (session.mode !== "payment") continue;
          await this.applyCheckout(session, customer.userId);
          const charge = (session.payment_intent as Stripe.PaymentIntent | null)
            ?.latest_charge as Stripe.Charge | null | undefined;
          if (charge?.refunded) {
            await revokeLots(this.db, {
              userId: customer.userId,
              originPrefix: packOrigin(session.id),
            });
          }
        }
      } catch (error) {
        logger.error(logTags, "Reconciliation failed for a customer", {
          stripeCustomerId: customer.stripeCustomerId,
          error,
        });
      }
    }
    return { customers: customers.length };
  }

  /**
   * The account is being deleted (privacy spec): its subscriptions end now,
   * open checkouts expire, and the Stripe customer (email, name, saved
   * card) is deleted. The charges and invoices stay in Stripe as records,
   * which is all the law requires.
   */
  async removeForDeletion(userId: string) {
    const customer = await new BillingRepository(this.db).findCustomerByUserId(
      userId
    );
    if (!customer) return;
    const subscriptions = await this.stripe.subscriptions
      .list({ customer: customer.stripeCustomerId, status: "all" })
      .autoPagingToArray({ limit: 100 });
    for (const subscription of subscriptions) {
      if (isLiveSubscription(subscription.status as SubscriptionStatus)) {
        await this.stripe.subscriptions.cancel(subscription.id);
      }
    }
    // A Checkout still open (a Pix waiting to be paid) can't charge an
    // account that no longer exists.
    const open = await this.stripe.checkout.sessions
      .list({ customer: customer.stripeCustomerId, status: "open" })
      .autoPagingToArray({ limit: 100 });
    for (const session of open) {
      await this.stripe.checkout.sessions.expire(session.id);
    }
    await this.stripe.customers.del(customer.stripeCustomerId);
  }

  /** The Stripe price of a catalog offer, by its lookup key. */
  private async priceId(product: CheckoutProduct) {
    const { lookupKey } = billingCatalog.prices[product];
    const [price] = (
      await this.stripe.prices.list({ lookup_keys: [lookupKey], active: true })
    ).data;
    if (!price)
      throw new Error(`Price ${lookupKey} is missing: run stripe:setup`);
    return price.id;
  }

  /** A subscription's one item, as Stripe has it now. */
  private async itemOf(stripeSubscriptionId: string) {
    const [item] = (
      await this.stripe.subscriptions.retrieve(stripeSubscriptionId)
    ).items.data;
    if (!item)
      throw new Error(`Subscription ${stripeSubscriptionId} has no item`);
    return item;
  }

  private async customerFor(userId: string) {
    const repository = new BillingRepository(this.db);
    const existing = await repository.findCustomerByUserId(userId);
    if (existing) return existing.stripeCustomerId;
    const user = await new UsersRepository(this.db).findById(userId);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    const created = await this.stripe.customers.create(
      {
        email: user.email,
        ...(user.fullName ? { name: user.fullName } : {}),
        metadata: { userId },
      },
      { idempotencyKey: `customer:${userId}` }
    );
    const kept = await repository.insertCustomer({
      userId,
      stripeCustomerId: created.id,
    });
    // Clerk keeps the link to the Stripe customer too (billing spec).
    try {
      await (
        await clerkClient()
      ).users.updateUserMetadata(user.clerkUserId, {
        privateMetadata: { stripeCustomerId: kept?.stripeCustomerId },
      });
    } catch (error) {
      logger.error(logTags, "Could not store the customer in Clerk", {
        error,
      });
    }
    return kept?.stripeCustomerId ?? created.id;
  }

  private async applyCheckout(
    session: Stripe.Checkout.Session,
    userId: string
  ) {
    if (session.mode === "subscription") {
      const subscriptionId = idOf(session.subscription);
      if (subscriptionId) await this.syncSubscription(subscriptionId, userId);
      const replaces = session.metadata?.replaces;
      if (replaces && session.payment_status === "paid") {
        await this.endReplaced(replaces, userId);
      }
      return;
    }
    // A pack: granted once paid (Pix completes asynchronously).
    if (session.mode !== "payment" || session.payment_status !== "paid") {
      return;
    }
    const createdAt = new Date(session.created * 1000);
    const expiresAt = new Date(createdAt);
    expiresAt.setUTCMonth(
      expiresAt.getUTCMonth() + creditSettings.packValidityMonths
    );
    await grantCredits(this.db, {
      userId,
      source: "pack",
      amount: creditSettings.packCredits,
      origin: packOrigin(session.id),
      expiresAt,
    });
  }

  /**
   * Saves Stripe's current view of a subscription, records its latest
   * invoice when paid, and grants that month's credits from it. When the
   * own-key plan ends (its period over, or switched to the credit
   * subscription), the key goes too, unless a courtesy grant still uses it.
   */
  private async syncSubscription(subscriptionId: string, userId: string) {
    const subscription = await this.stripe.subscriptions.retrieve(
      subscriptionId,
      { expand: ["latest_invoice"] }
    );
    const [item] = subscription.items.data;
    if (!item) return;
    const invoice =
      typeof subscription.latest_invoice === "object"
        ? subscription.latest_invoice
        : null;
    const period = invoice?.status === "paid" ? paidPeriod(invoice) : null;
    const plan = planOfProduct(idOf(item.price.product));
    const status = subscription.status as SubscriptionStatus;
    await this.db.transaction(async (tx) => {
      const repository = new BillingRepository(tx);
      const before = await repository.findSubscriptionByStripeId(
        subscription.id
      );
      await repository.upsertSubscription({
        userId,
        stripeSubscriptionId: subscription.id,
        plan,
        status,
        interval: item.price.recurring?.interval === "year" ? "year" : "month",
        currentPeriodStart: new Date(item.current_period_start * 1000),
        currentPeriodEnd: new Date(item.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      });
      if (invoice?.id && period) {
        await repository.recordPaidInvoice({
          stripeSubscriptionId: subscription.id,
          invoiceId: invoice.id,
          periodStart: period.start,
          periodEnd: period.end,
        });
      }
      const now = new Date();
      await ensureMonthlyCredits(tx, userId, now);
      const leftOwnKey =
        (before?.plan === "own_key" && plan === "credits") ||
        (plan === "own_key" && !isLiveSubscription(status));
      const { kind } = await currentPlan(tx, userId, now);
      if (leftOwnKey && kind !== "own_key" && kind !== "courtesy") {
        await new AiKeysRepository(tx).delete(userId);
      }
    });
  }

  /**
   * The credit subscription the own-key one replaced ends now, refunding
   * nothing (billing spec, "Switching plans"); its paid period keeps
   * granting credits. Done once: the return from Checkout, the webhook and
   * reconciliation may all get here.
   */
  private async endReplaced(stripeSubscriptionId: string, userId: string) {
    const repository = new BillingRepository(this.db);
    const old =
      await repository.findSubscriptionByStripeId(stripeSubscriptionId);
    if (old?.userId !== userId || old.replacedAt) return;
    const current =
      await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
    if (isLiveSubscription(current.status as SubscriptionStatus)) {
      await this.stripe.subscriptions.cancel(stripeSubscriptionId, {
        prorate: false,
        invoice_now: false,
      });
    }
    await repository.markReplaced(stripeSubscriptionId, new Date());
  }

  /**
   * A refund takes back what it paid for (billing spec: reconciliation
   * covers "refunds"): a pack's credits, or a subscription invoice's months.
   * A refund that arrives before the grant still wins: the grant is made
   * first, then revoked, so a late webhook can't bring it back.
   */
  private async applyRefund(charge: Stripe.Charge, userId: string) {
    if (!charge.refunded) return;
    const paymentIntentId = idOf(charge.payment_intent);
    if (!paymentIntentId) return;
    const [session] = (
      await this.stripe.checkout.sessions.list({
        payment_intent: paymentIntentId,
        limit: 1,
      })
    ).data;
    if (session?.mode === "payment") {
      await this.applyCheckout(session, userId);
      await revokeLots(this.db, {
        userId,
        originPrefix: packOrigin(session.id),
      });
      return;
    }
    const [payment] = (
      await this.stripe.invoicePayments.list({
        payment: { type: "payment_intent", payment_intent: paymentIntentId },
        limit: 1,
      })
    ).data;
    const invoiceId = idOf(payment?.invoice);
    if (!invoiceId) return;
    await new BillingRepository(this.db).endPaidPeriod(invoiceId, new Date());
    await revokeLots(this.db, {
      userId,
      originPrefix: invoiceOrigin(invoiceId),
    });
  }
}
