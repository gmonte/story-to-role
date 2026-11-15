import { clerkClient } from "@clerk/nextjs/server";
import { TRPCError } from "@trpc/server";
import type Stripe from "stripe";

import {
  ensureMonthlyCredits,
  grantCredits,
  invoiceOrigin,
  packOrigin,
  revokeLots,
} from "@repo/api/domains/credits/credit-ledger";
import { creditSettings } from "@repo/api/domains/credits/credit-pricing";
import { UsersRepository } from "@repo/api/domains/users/users-repository";
import type { DbClient } from "@repo/api/tools/db-client";
import { getStripe } from "@repo/api/tools/stripe/stripe-client";
import { logger } from "@repo/common/tools/logger";

import { billingCatalog } from "./billing-catalog";
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

/** The service period an invoice paid for (its subscription line's). */
function paidPeriod(invoice: Stripe.Invoice) {
  const line = invoice.lines.data.find(
    (row) => row.parent?.type === "subscription_item_details"
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
    private readonly stripe: StripeGateway = getStripe()
  ) {}

  async status(userId: string): Promise<BillingStatus> {
    const repository = new BillingRepository(this.db);
    const subscription = await repository.findSubscriptionByUserId(userId);
    return {
      subscription: subscription && {
        status: subscription.status,
        interval: subscription.interval,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      hasCustomer: !!(await repository.findCustomerByUserId(userId)),
    };
  }

  /** A Stripe Checkout page for the subscription or a pack. */
  async startCheckout(input: {
    userId: string;
    product: CheckoutProduct;
    baseUrl: string;
  }) {
    const price = billingCatalog.prices[input.product];
    const subscribing = price.product === "subscription";
    if (subscribing) {
      const current = await new BillingRepository(
        this.db
      ).findSubscriptionByUserId(input.userId);
      if (current && isLiveSubscription(current.status)) {
        // One subscription: changes go through the Customer Portal.
        throw new TRPCError({ code: "CONFLICT" });
      }
    }
    const [stripePrice] = (
      await this.stripe.prices.list({
        lookup_keys: [price.lookupKey],
        active: true,
      })
    ).data;
    if (!stripePrice) {
      throw new Error(`Price ${price.lookupKey} is missing: run stripe:setup`);
    }
    const customer = await this.customerFor(input.userId);
    const metadata = { userId: input.userId, product: input.product };
    const session = await this.stripe.checkout.sessions.create({
      mode: subscribing ? "subscription" : "payment",
      customer,
      client_reference_id: input.userId,
      line_items: [{ price: stripePrice.id, quantity: 1 }],
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

  /** The Customer Portal: card, invoices, monthly or annual, cancelling. */
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
   * invoice when paid, and grants that month's credits from it.
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
    await this.db.transaction(async (tx) => {
      const repository = new BillingRepository(tx);
      await repository.upsertSubscription({
        userId,
        stripeSubscriptionId: subscription.id,
        status: subscription.status as SubscriptionStatus,
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
      await ensureMonthlyCredits(tx, userId, new Date());
    });
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
