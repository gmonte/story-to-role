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
- **Courtesy plan:** the owner can grant the paid plan to selected users without a subscription. It works without a key, funded by StoryToRole credits; the user may add their own key so the owner does not carry the whole AI cost, and then the key funds the AI calls.

**Funding order.** Each AI call is funded in this order, so a user is never charged twice for the same month:

1. The plan's monthly credits, already paid for and the first to expire.
2. The user's own key, when there is one.
3. Stored credits (packs and welcome credits), only once both of the above are exhausted, and only after the user confirms ("Finish with credits"); never silently.

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

The Free plan lets the user record their recent history and build one resume in each output language and one cover letter. The full career interview is part of the paid plans.

1. The user uploads their current resume and an opening. The resume pre-fills the career timeline and the opening gets a fit check.
2. The interview is limited only by credits: the user decides where to spend them, going deep on a few positions or telling a little about each, with the short script suggested by default. The two most recent positions are proposed first. When the user has no position yet (a first job or a career change), the interview asks what they want to work with and which notable experiences they have in that area: projects, studies, volunteering, freelance work.
3. StoryToRole generates a new resume tailored to the opening.

Free is limited by credits only: 200 welcome credits, granted once, spent however the user wants (interview, truth file import, fit checks, documents, gap questions), plus 10 credits a month for fit checks so users keep coming back. The pricing page says what 200 credits are enough for ("tell your recent story and get your resume in Portuguese and English plus a cover letter"), and the product makes clear at every limit that subscribing unlocks more: the credit meter, the reserve alert and the end of the welcome credits all point to the subscription. Maximum AI cost per signup is about US$2.

Every generation option is available in Free, limited only by credits: Quick or Thorough review rounds, standard or maximum writing level. Each option shows its credit estimate before the user confirms. Free preselects Quick with the standard level and says why: it leaves enough credits for the second language and the cover letter.

## Credit packs

Credit packs are sold without a subscription, for users who want to pay only when they use. They are priced so that a credit bought in a pack clearly costs more than a credit in the subscription, which makes the subscription the obvious choice for anyone applying regularly, while still covering AI cost plus margin. Pricing is never per opening or per document.

Packs also serve bring-your-own-key users: when their key runs out of credit, they can finish a task with StoryToRole credits after confirming (see the guided interview spec). Claude Max and Team subscribers receive monthly API credits on a linked Console organization; a key from that organization works as a bring-your-own key, which makes the BYOK plan attractive to them.

## Credit meter

- The meter leads with what the user can still spend this month, translated into actions from the user's own usual choices: "You can still spend 470 credits this month (about 9 resumes or 33 cover letters)". One tap shows the breakdown by source and expiry: "320 from the plan, expire on Nov 30; 150 from a pack, valid until Mar 2027". With key funding, it shows the estimated spend on the user's key this month, with credits shown as a reserve.
- The user always sees the cost of the next action before taking it.
- A **credit reserve** keeps enough credits for the step the user came for: in the Free plan, the resume generation. When the balance approaches the reserve, the interviewer is told to wrap up the current position with what was said, and the user sees an alert, so the interview never consumes the credits the resume needs.

## Payments

Stripe directly, through an account opened in Brazil under the owner's CNPJ; Clerk handles sign-in only and stores the link to the Stripe customer. Clerk Billing was ruled out because it charges in USD only and has no credits, metered billing or one-time packs.

- **Stripe Checkout** (Stripe-hosted page) for both the subscription and credit packs.
- The subscription is a flat-rate price, monthly and annual, with one price in BRL and one in USD. Each paid invoice triggers a webhook that grants that month's credits in a credit ledger in Postgres; packs grant theirs when the one-time payment succeeds. Stripe's Metronome credit burndown is not used: credits live in StoryToRole's ledger.
- **Stripe Customer Portal** for changing card, switching between monthly and annual, and cancelling.
- No trial: the Free plan plays that role.

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

## Cost model (estimate)

Prices from the Claude API reference, cached 2026-10-06, in USD per million tokens: Haiku 5.5 $0.10 input / $0.50 output; Sonnet 5.5 $2 / $10 (cache reads $0.20); Opus 5.5 $4 / $20 (cache reads $0.20). Cache writes cost 1.25x input.

Token assumptions per action, to be replaced by measured usage from the first prototype (the provider adapter records usage per call):

| Action | Calls and tokens assumed | Model | Estimated AI cost (USD) |
| --- | --- | --- | --- |
| Fit check | Keyword extraction (2k in, 1.3k out) + judgment over retrieved evidence (4k in, 1.5k out) | Haiku | 0.002 |
| Fit check | Same, judged by Sonnet | Haiku + Sonnet | 0.024 |
| Adjustment | One call (6k in, 3k out) | Sonnet | 0.042 |
| Cover letter | Draft, review, edit; 8k prefix cached | Sonnet | 0.093 |
| Resume | 7 calls (strategist, review, editor, about two revision rounds, report); 9.5k prefix cached; 2.5k out each | Sonnet | 0.24 |
| Resume | Same | Opus | 0.46 |
| Resume, ten positions | Same 7 calls; relevant evidence only (about 600 tokens per position, 10k prefix cached); 3.5k out each | Sonnet | 0.32 |
| Resume, ten positions | Same, sending the whole evidence base instead of retrieved evidence (54k prefix) | Sonnet | 0.52 |
| Interview turn | Topic gate (Haiku) + turn with 15k cached history, 0.7k out | Haiku + Sonnet | 0.011 |
| Interview, one position | About 30 turns + 1.5 extractions (20k in, 3k out) | Sonnet | 0.44 |
| Interview, eight positions | | Sonnet | 3.51 |

Thinking tokens are billed as output and are the largest uncertainty; the estimates assume moderate effort. Output dominates generation cost: each call of the revision loop rewrites the whole resume, so the number of revisions is the largest lever, and a longer career costs more mainly because the resume is longer, not because more context is sent.

## Open points

- The value of one credit and the credits each action costs.
- Which models platform plans use for each action.
- Whether the career interview consumes credits.
- Fixed credits per action or metering by actual usage.
- Credits granted per plan and plan prices.
- Requesting Pix (invitation only) for one-time packs.
