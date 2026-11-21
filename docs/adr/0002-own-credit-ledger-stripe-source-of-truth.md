# Own credit ledger, with Stripe as the source of truth for purchases

Credits live in an append-only ledger in Postgres (grants, debits, reservations, expiries, refunds), not in Stripe. Every AI call must be checked and debited before it runs, in the same transaction that starts the task, following the funding order of the user's plan (billing spec, "Funding order": the plan's monthly credits first, then the user's key on the plans that use one, then stored credits after confirmation), with a reservation of the estimated cap settled to the actual cost afterwards. Stripe only tells us, by webhook, that money came in; every grant records the Stripe event, Clerk sign-up or admin grant that caused it, and a reconciliation job can rebuild all grants idempotently. Restores happen on a separate Neon branch, so a restored backup never costs a user paid credits: lost grants come back from Stripe, and lost debits only favor the user.

## Considered Options

- **Stripe billing credits with Meters:** credits are monetary, apply only when an invoice is finalized (postpaid), do not stop usage in real time, do not apply to one-time packs, and are capped at 100 unused grants per customer. We would still need a local check, so two ledgers to keep in sync.
- **Metronome:** adds 0.8% of billing volume plus per-event fees, sends usage to another vendor, and real-time enforcement would still need local state.
