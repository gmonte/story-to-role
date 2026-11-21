# The own key is a subscription of its own, and plan switches go through the app

Bringing an Anthropic key is a plan, the **own-key subscription** (R$19.90 or US$5 a month, R$199 or US$50 a year), not a funding mode of the subscription. The **credit subscription** never uses a key; the own-key one opens only with a key the provider accepts, checked before Checkout, keeps charging when the key stops working (stored credits and packs finish the work after confirmation), and lets the key be replaced at any time but removed only once it is cancelled. Plan switches follow the billing spec, "Switching plans", and run through StoryToRole's app, never the Stripe Customer Portal:

- **Credit → own-key:** a new Checkout; once it is paid, the old subscription is cancelled without a refund and marked replaced, and its paid period keeps granting its monthly credits until the date it would have ended.
- **Own-key → credit:** the subscription's price changes at once with the billing period restarting now and the unused own-key time prorated on the invoice; if the payment fails, Stripe keeps the subscription as it was.
- **Monthly ↔ annual:** the app opens the portal on a second configuration for that one change (`subscription_update_confirm`); a shorter interval is scheduled at the period's end. The default portal allows no price change.

## Considered Options

- **The key as a funding mode of the subscription** (the earlier spec): one price for two very different costs to StoryToRole, a subscriber paying for credits they leave unused, and a price switch at renewal that was hard to explain. Replaced by two subscriptions priced for what each costs.
- **Plan switches in the Customer Portal:** a portal configuration lists the products a subscriber may switch between, not which switches are allowed; listing both subscriptions would let a credit subscriber move to the own-key one without a key check. Re-enabling price changes on the default portal brings that back.
- **Credit → own-key as a price change with proration:** Stripe would credit the unused time as money on the next invoices, but those amounts outlast a R$19.90 plan for months on an annual switch and read as a partial refund. Keeping the old subscription's paid period granting credits gives the user what they paid for, in kind, and refunds nothing.
- **Own-key → credit keeping the renewal date:** the prorated difference near the end of a month is a few reais, yet the switch grants the month's 600 credits; cancelling right after would buy credits at a fraction of their price. Restarting the period charges a full month minus the unused own-key time.
