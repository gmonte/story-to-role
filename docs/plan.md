# StoryToRole implementation plan

How to build the MVP described in `docs/specs/`, in vertical slices. Each slice ends usable end to end, with its acceptance criteria passing. Read `GLOSSARY.md` and the ADRs in `docs/adr/` before starting; the specs are the source of truth and this plan only orders the work.

## Ground rules

- Follow `CLAUDE.md` (nvm, pnpm catalogs, Conventional Commits, generated migrations, `@repo/intl`).
- One commit per coherent step; run `pnpm lint` and `pnpm test` before each commit.
- Tests never call real AI providers, Stripe or Trigger.dev: mock them at the adapter boundary. Database tests use PGlite, as the repo already does.
- Every AI call runs in a Trigger.dev task that receives only IDs (ADR 0003). No career content in logs anywhere (privacy spec).
- Code enforces, the AI suggests: locked facts, sensitive-item choices, forbidden terms and the credit ledger are code, never prompt-only.
- When a spec is ambiguous, pick the option closest to the spec's principles, note the assumption in the commit body, and keep going. Do not change specs or ADRs without saying why in the commit.

## Slice 1: Foundation

Goal: the plumbing every later slice relies on.

- Remove the inherited Clerk Organizations sync: `organizations` and `organization_memberships` tables (generated migration), their webhook handlers, domain code and router entries. Keep `user.created`, `user.updated`, `user.deleted`.
- Webhook logging records only the event type and user id.
- Environment schema (`packages/common/src/env/web.env.ts`): add `STORAGE_DRIVER`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` (the names the Vercel Upstash integration sets), `TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (Stripe optional until slice 6). App refuses to start with `STORAGE_DRIVER=local` unless `NEXT_PUBLIC_ENV=development`.
- A script that loads `.env.local` before drizzle-kit commands.
- Storage interface (put, get, delete) with `local` (git-ignored `.storage/`) and `vercel-blob` drivers.
- Per-user envelope encryption utilities (AES-256-GCM, master key in its own env var with a version) for career content and bring-your-own keys.
- Trigger.dev 4.8.5, the latest at planning time; confirm with `pnpm view trigger.dev version` before installing (`trigger.dev`, `@trigger.dev/sdk`, `@trigger.dev/build` in the `api` catalog; `@trigger.dev/react-hooks` in `web`), `packages/api/trigger.config.ts` modeled on the adc-monorepo setup, `trigger:dev` script, a `tasks` table storing run ids, and Realtime subscription in the web app.
- Provider package abstraction with the Anthropic package (Haiku 5.5 classification, Sonnet 5.5 writing, Opus 5.5 maximum level); every call records token usage.
- Topic gate that follows the AI funding (user's key with key funding, StoryToRole's key with credits) and fails closed, and rate limits with `@upstash/ratelimit` (local SRH via `docker compose up -d`).
- Workspace shell (workspace spec): sidebar with My career, Library, New opening and openings by status; chat center; side panel; interface language via `@repo/intl`.

Acceptance:
- [ ] Signing up creates a local user through the Clerk webhook; no organization tables remain.
- [ ] A sample task triggered from the app runs under `trigger:dev`, receives only an id, and its progress shows in the browser through Realtime.
- [ ] An off-topic message gets the fixed reply and makes no main-model call; rate limits block bursts.
- [ ] Encrypted fields are unreadable in the database and readable through the service.
- [ ] `STORAGE_DRIVER=local` with a non-development environment fails at startup.

## Slice 2: Career base

Goal: the guided interview spec, end to end, for one user.

- Import resumes (PDF/DOCX converted to text by code) and truth files; timeline merge with side-by-side conflicts; manual add, edit, merge and remove of positions.
- Guided interview per position: orchestrator plus position agent, the six-stage script and the short script, sessions with token-measured checkpoints, agent tools from the spec, timeline proposal cards.
- Extraction approval screen showing the user's words beside each extracted line; evidence with encrypted source quotes; sensitive items with use, generalize or exclude; credentials with optional stories; depth levels.
- Transcripts deleted 7 days after approval.
- Interview and interface languages, on-device voice input (Web Speech API with `processLocally`, OS dictation hint otherwise).

Acceptance: the acceptance criteria listed in `docs/specs/guided-interview.md`, plus credentials and depth.

## Slice 3: Openings and fit check

- Add an opening by pasting text or a link (link reading in an isolated task, per the workspace spec); unsolicited openings.
- Local multilingual embeddings in a Trigger.dev task, pgvector (generated migration enables the extension).
- Hybrid fit check (keywords and requirements, retrieval, cheap judgment) shown as a hint; gap questions; list of analyzed openings.

Acceptance:
- [ ] Adding an opening shows a band, requirements linked to evidence and gaps, with no percentage.
- [ ] A senior requirement against a junior history is judged a gap, not a match.
- [ ] Similar library and application documents are suggested by vector similarity.

## Slice 4: Resume generation

- Applications start with the first generated or copied document; application instructions with point-by-point promotion; locked-fact overrides.
- Generation with review rounds (Quick or Thorough), writing level, style profile and tones, ATS check, global template with conditional sections and the section catalog.
- Documents, versions (several per language allowed), snapshots as a stack, undo, duplicate, adaptation and language sync, outdated markers, evidence trace in the editor, change history.
- PDF rendering in the specified layout, file names, application ZIP, copy text; library documents titled by focus.

Acceptance:
- [ ] A resume for an opening fits in two pages, passes locked-fact and forbidden-term checks, and every line shows its origin in trace mode.
- [ ] Adapting a version to another language keeps the evidence and adds no fact; an approved title equivalent is used.
- [ ] Undo removes only the latest snapshot; the official snapshot is always the latest.

## Slice 5: Cover letter

- Company research task (web search, approved company facts stored per application), motivation interview with career goals, story choice, storytelling methodology, outdated letters when their resume changes.

Acceptance:
- [ ] The letter tells one story from approved evidence, uses only approved company facts, and fits one page.

## Slice 6: Credits and billing

- Credit ledger (reservations, settlement, funding order, expiry), reconciliation job, welcome and monthly credits, packs, courtesy grants from an admin page, credit meter, capped estimates.
- Stripe (sandbox): Checkout for subscription and packs, Customer Portal, webhooks granting credits, grant on return from Checkout (retrieving the session), periodic reconciliation task, products and prices created by a versioned script.
- Bring-your-own keys stored encrypted, validated on save; "Finish with credits" when a key runs out.

Acceptance:
- [ ] Concurrent tasks never spend the same credits; a failed task releases its reservation.
- [ ] Re-running reconciliation never duplicates a grant and restores a missing one.
- [ ] A paid invoice grants monthly credits; a courtesy user with a key spends the key first.

## Slice 7: Tracker, privacy and the rest

- Tracker statuses, events, external applications, in-app reminders, submission record of sent snapshots.
- Account export and deletion (privacy spec).
- Onboarding paths (workspace spec).

## Not in the MVP

Hiring interview prep, team or recruiter accounts, email reminders, OpenAI package and "Sign in with ChatGPT", languages beyond English and Brazilian Portuguese, final prices.
