# StoryToRole spec: Billing and credits

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Principle

Users pay for what they use plus a margin that keeps the project running. The stack is chosen for free tiers that scale by upgrading a plan (Vercel, Neon, Clerk, Trigger.dev, Upstash), so fixed costs stay near zero until there is usage.

## Credits

- The offer is: **Free** (welcome credits), **credit packs** (no subscription), a **subscription** (monthly or annual, with monthly credits) and **BYOK** (monthly or annual, platform only, AI paid by the user's own key). There is no lifetime plan. Nothing is ever priced per opening or per document.
- Plans grant **credits**.
- Every AI action consumes credits: fit checks, generations and adjustments (adaptation to another language, language sync, cover letter update). Credits replace separate counters for evaluation and generation; actions still differ in how many credits they cost.

## Plans and AI funding

A user's **plan** (what they can use) is separate from their **AI funding** (who pays for each AI call: StoryToRole credits or the user's own key).

- **Bring your own key is a funding mode, not a separate plan.** A subscriber who adds a key from a certified provider switches to key funding; removing the key switches back to credits.
- **Courtesy plan:** the owner grants the paid plan to selected users without a subscription, from an admin page restricted to the Clerk admin role, with an optional end date and a monthly quota of courtesy credits set per grant (zero allowed). It lives in StoryToRole's database, not in Stripe. Since the owner pays for courtesy credits, the funding order differs: the user's own key first when there is one, then courtesy credits, then the user's stored credits after confirmation. When the grant ends, the user returns to Free. The owner's own account uses a courtesy grant with their Claude key.

**Funding order.** Each AI call is funded in this order, so a user is never charged twice for the same month:

1. The plan's monthly credits, already paid for and the first to expire.
2. The user's own key, when there is one.
3. Stored credits (packs and welcome credits), only once both of the above are exhausted, and only after the user confirms ("Finish with credits"); never silently.

What the user asks for is charged: each message to the profile agent, validating the profile, importing a resume or truth file, a fit check, a gap question, and each generation (resume, cover letter, adjustment, adaptation), its coverage review included. What runs without the user asking costs them nothing: the profile's linter and "Fix format" are plain code, and embedding a published profile runs locally. Any AI call the product makes on its own initiative runs on the user's key on a paid plan when there is one, otherwise StoryToRole pays; no credit is reserved or taken.

A subscriber who adds a key mid-month keeps spending that month's credits first; the key takes over when they run out. The subscription switches to the key price at the next renewal, when no new monthly credits are granted; removing the key switches back at the next renewal as well.

## Subscription

One subscription size at launch, monthly or annual. A larger tier comes only when usage data shows a group of subscribers buying packs every month.

## Credit expiry

- Monthly credits expire at the end of each billing month; they do not roll over, as with the monthly allowances of AI subscriptions such as Claude Max.
- Credits bought in packs are valid for 12 months.
- Welcome credits never expire.
- Each debit consumes the credits that expire first.

## Currencies

Two independent price tables: BRL for Brazil and USD for everyone else, chosen by billing country, not by converting at the day's exchange rate. BRL prices follow local purchasing power and always stay above AI cost plus margin. A credit buys the same AI work in both currencies.

Stripe's presentment-currency list for Brazil-based accounts (docs.stripe.com/currencies, checked 2026-11-14) includes USD, with these exceptions: Brazilian cards can only be charged in BRL; American Express is not accepted in any currency; the list applies to cards, while local methods (Pix, boleto) take only their own currency. Brazilian accounts settle only in BRL, so USD charges are converted to BRL; the conversion fee is still to be confirmed with Stripe and goes into the USD price margin. Adaptive Pricing (BRL prices shown in the customer's currency, conversion paid by the customer) remains the fallback.

## Free plan

The Free plan lets the user build their profile and get one resume in each output language and one cover letter.

1. The user uploads their current resume, which writes the profile's first draft; they publish it (validated or not), then add an opening and get its fit check.
2. Working on the profile is limited only by credits: the user decides where to spend them, asking the agent about a few positions in depth or about each one briefly, and validating when they choose. The editor itself, its linter and "Fix format" are free. When the user has no position yet (a first job or a career change), the agent asks what they want to work with and which notable experiences they have in that area: projects, studies, volunteering, freelance work.
3. StoryToRole generates a new resume tailored to the opening.

Free is limited by credits only: 200 welcome credits, granted once, spent however the user wants (agent messages, validation, resume and truth file import, fit checks, documents, gap questions), plus 10 credits a month for fit checks so users keep coming back. The pricing page says what 200 credits are enough for ("write your profile and get your resume in Portuguese and English plus a cover letter"), and the product makes clear at every limit that subscribing unlocks more: the credit meter, the reserve alert and the end of the welcome credits all point to the subscription. Maximum AI cost per signup is about US$2.

Every generation option is available in Free, limited only by credits: Quick or Thorough review rounds, standard or maximum writing level. Each option shows its credit estimate before the user confirms. Free preselects Quick with the standard level and says why: it leaves enough credits for the second language and the cover letter.

## Credit packs

Credit packs are sold without a subscription, for users who want to pay only when they use. They are priced so that a credit bought in a pack clearly costs more than a credit in the subscription, which makes the subscription the obvious choice for anyone applying regularly, while still covering AI cost plus margin. Pricing is never per opening or per document.

Packs also serve bring-your-own-key users: when their key runs out of credit, they can finish a task with StoryToRole credits after confirming (see [ai-platform.md](./ai-platform.md)). Claude Max and Team subscribers receive monthly API credits on a linked Console organization; a key from that organization works as a bring-your-own key, which makes the BYOK plan attractive to them.

## Credit ledger

Credits live in an append-only ledger in Postgres: grants, debits, reservations, expiries and refunds; the balance is their sum. Checking and debiting happen in the same database transaction as starting the AI task, following the funding order, so a balance can never be overspent and two concurrent tasks cannot spend the same credits. A task reserves its estimated cap when it starts and settles to the actual cost when it ends; a failed task releases its reservation.

- **Every grant points to its origin:** a Stripe event (paid invoice, completed checkout) for purchases, the Clerk sign-up for welcome credits, the admin grant for courtesy credits. Stripe is the source of truth for money paid.
- **A reconciliation job** can rebuild all grants from Stripe, Clerk and the admin grants at any time, idempotently: it never duplicates a grant and restores any that is missing.
- **Backups never cost users paid credits.** Restores go to a separate Neon branch, never over production. If an older state is ever restored, reconciliation brings back every grant made since; debits lost in the restore only return credits to users, so any loss falls on StoryToRole, never on them.
- Stripe billing credits and Metronome were ruled out: Stripe's credits apply only when an invoice is finalized (postpaid), do not stop usage in real time, do not apply to one-time packs and are monetary amounts; Metronome adds 0.8% of billing volume plus per-event fees.

## Credit meter

- The meter leads with what the user can still spend this month, translated into actions from the user's own usual choices: "You can still spend 470 credits this month (about 9 resumes or 33 cover letters)". One tap shows the breakdown by source and expiry: "320 from the plan, expire on Nov 30; 150 from a pack, valid until Mar 2027". With key funding, it shows the estimated spend on the user's key this month, with credits shown as a reserve.
- The user always sees the cost of the next action before taking it.
- A **credit reserve** keeps enough credits for the step the user came for: in the Free plan, the resume generation. When the balance approaches the reserve, the user sees an alert before each agent message and validation, so working on the profile (agent messages, validation and imports) never consumes the credits the resume needs.

## Payments

Stripe directly, through an account opened in Brazil under the owner's CNPJ; Clerk handles sign-in only and stores the link to the Stripe customer. Clerk Billing was ruled out because it charges in USD only and has no credits, metered billing or one-time packs.

- **Stripe Checkout** (Stripe-hosted page) for both the subscription and credit packs.
- The subscription is a flat-rate price, monthly and annual, with one price in BRL and one in USD. Each paid invoice triggers a webhook that grants that month's credits in a credit ledger in Postgres; packs grant theirs when the one-time payment succeeds. Stripe's Metronome credit burndown is not used: credits live in StoryToRole's ledger.
- **Pix** for credit packs, requested from Stripe when the account is opened (Pix is invitation-only in Brazil); the subscription stays on cards. If the invitation is slow, launch with cards only. A Brazilian gateway (Asaas, Mercado Pago) would bring Pix without invitation and Pix Automático for recurring charges, at the cost of a second payment system; it is reconsidered only if data shows people abandoning the subscription for lack of Pix.
- **Stripe Customer Portal** for changing card, switching between monthly and annual, and cancelling.
- No trial: the Free plan plays that role.

**Environments.** Local development, merge request previews and staging point to a Stripe sandbox (test mode); only production points to the live Stripe account, configured later. Development starts locally, where `stripe listen --forward-to localhost:3000/api/webhooks/stripe` delivers webhooks and generates the local webhook secret; products and prices are created by a versioned script so every environment matches.

**Webhooks are a shortcut; reconciliation is the guarantee.** Staging and production register a Stripe webhook endpoint (sandbox for staging, live for production) with their own signing secrets; locally, `stripe listen` forwards events. Merge request previews have changing URLs and no webhook at all, and still work:

- On return from Checkout, the success page reads the `session_id`, retrieves the session from Stripe and grants the credits right away, with the same idempotency key a webhook would use, so a later webhook never duplicates the grant.
- A periodic Trigger.dev job reconciles renewals, cancellations and refunds from Stripe, looking only at the Stripe customers that exist in that environment's database; the sandbox is shared by all previews, but each sees only its own customers.
- The same retrieval and reconciliation also cover a webhook lost in production.

Webhook destinations use the account scope (no Stripe Connect), snapshot payloads and API version `2026-10-28.endive`, which the Stripe SDK pins too so event and request shapes match. Subscribed events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` (Pix completes asynchronously), `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`. The sandbox destination for staging points to `https://stg-storytorole.vercel.app/api/webhooks/stripe`; its signing secret belongs in staging's `STRIPE_WEBHOOK_SECRET`, distinct from the local one printed by `stripe listen`.

Locally, `stripe listen` does not use the dashboard destination's event list: by default it forwards every event of the sandbox account. A `pnpm stripe:listen` script passes the same eight events with `--events`. The webhook route answers 200 to any event it does not handle, and ignores Stripe customers that do not exist in its environment's database, since all non-production environments share one sandbox and receive each other's events.

Stripe Brazil standard fees (stripe.com/br/pricing, read 2026-11-14):

| Item | Fee |
| --- | --- |
| Domestic card | 3.99% + R$0.39 per successful transaction |
| International card | +2% on top, computed after conversion to BRL |
| Pix | 1.19% per paid Pix; by invitation only |
| Boleto | R$3.45 per paid boleto |
| Stripe Billing | +0.7% of subscription billing volume; not charged on one-time payments |
| Checkout, Payment Links, 3D Secure | Included |
| Dispute | R$55 received, plus R$55 if countered (returned when won) |

Examples: a R$49 subscription on a Brazilian card keeps R$46.31 (5.5% in fees); a R$29 pack keeps R$27.45 (5.3%); a US$12 subscription on a foreign card keeps about US$11.13 (7.3%). Still to confirm with Stripe: the currency conversion fee for USD charges settled in BRL. Neither Stripe's localize-prices page (manual currency prices: "0% fee paid by Stripe users", while conversion in general "is subject to fees as detailed on our pricing page") nor a third-party fee table from November 2025 (Brazil row: 3.99% + R$0.39, +2% for international cards; most other countries add "+2% if currency conversion is required") states one for Brazil. Until a test charge's balance transaction or Stripe support confirms it, USD prices assume the worst case of an extra 2%: about 8.7% + US$0.07 on a US$12 subscription paid with a foreign card. Brazilian taxes on revenue are outside Stripe and need an accountant.

## Credit value and pricing of actions

- **One credit is about US$0.01 of expected AI cost** on the default provider package, including a 1.5x safety margin for retries, variance and longer thinking. Sale prices per plan cover AI cost, Stripe fees (about 5% to 9%, worst case with a foreign card) and the margin. If the default package changes, credits per action are recalculated; the money value of a credit stays the same.
- With the Anthropic package, actions cost about: fit check 1, gap question 1, agent message 2, profile validation about 5 (one changed section) to 20 (a whole new profile), adjustment 7, cover letter 14, truth file import about 20 (for about 12,000 words), resume 37 to 55 (Quick, standard level) or 72 to 108 (Quick, maximum level), depending mostly on career length.
- **Estimate with a cap.** Before an action, the user sees "up to N credits", computed from their career size, the chosen review depth and writing level. The ledger reserves the cap, settles to the actual cost when the task ends and never charges above the cap. When Thorough stops early, the user pays only the rounds that ran. The per-action table is recalibrated from measured usage.

## Cost model (estimate)

Prices from the Claude API reference, cached 2026-10-06, in USD per million tokens: Haiku 5.5 $0.10 input / $0.50 output; Sonnet 5.5 $2 / $10 (cache reads $0.20); Opus 5.5 $4 / $20 (cache reads $0.20). Cache writes cost 1.25x input.

Token assumptions per action, to be replaced by measured usage from the first prototype (the provider adapter records usage per call):

| Action | Calls and tokens assumed | Model | Estimated AI cost (USD) |
| --- | --- | --- | --- |
| Fit check | Keyword extraction (2k in, 1.3k out) + judgment over retrieved profile passages (4k in, 1.5k out) | Haiku | 0.002 |
| Fit check | Same, judged by Sonnet | Haiku + Sonnet | 0.024 |
| Adjustment | One call (6k in, 3k out) | Sonnet | 0.042 |
| Cover letter | Draft, review, edit; 8k prefix cached | Sonnet | 0.093 |
| Resume | 7 calls (strategist, review, editor, about two revision rounds, report); 9.5k prefix cached; 2.5k out each | Sonnet | 0.24 |
| Resume | Same | Opus | 0.46 |
| Resume, ten positions | Same 7 calls; relevant profile passages only (about 600 tokens per position, 10k prefix cached); 3.5k out each | Sonnet | 0.32 |
| Resume, ten positions | Same, sending the whole profile instead of retrieved passages (54k prefix) | Sonnet | 0.52 |
| Agent message | Topic gate (Haiku) + turn with the passage, its section, the index and 10k cached history, 0.7k out | Haiku + Sonnet | 0.011 |
| Profile validation, one section | The changed section plus the index (4k in, 1.5k out) | Sonnet | 0.023 |
| Coverage review | Code checks + one call over the document and its passages (8k in, 2k out) | Sonnet | 0.036 |

Thinking tokens are billed as output and are the largest uncertainty; the estimates assume moderate effort. Output dominates generation cost: each call of the revision loop rewrites the whole resume, so the number of revisions is the largest lever, and a longer career costs more mainly because the resume is longer, not because more context is sent.

## Prices (initial hypothesis)

Final prices are set after a closed beta that measures real consumption, with testers on courtesy grants. The starting hypothesis: an active user spends about 300 to 700 credits a month (10 to 20 openings analyzed, 5 to 10 resumes, some cover letters and adjustments). The subscription grants 600 credits a month, about US$6 of AI cost in the worst case; with Stripe fees and a 50% margin on total cost, that suggests around R$59 or US$12 a month. Pack credits cost about 30% more than subscription credits; key funding costs about a third of the subscription.

## Taxes

Brazilian taxes on revenue (Simples Nacional, ISS, service invoices; possible exemptions on service exports) are outside Stripe. An accountant is consulted before the paid beta. What affects the system is recorded here once known: issuing a service invoice per sale (likely through an invoicing service triggered by Stripe's webhook) and taxes built into prices. Final prices close only after this.

## Open points

- Final credits per plan and prices, after the beta.

