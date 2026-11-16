# StoryToRole implementation plan

How to build the MVP described in `docs/specs/`, in vertical slices. Each slice ends usable end to end, with its acceptance criteria passing. Read `GLOSSARY.md` and the ADRs in `docs/adr/` before starting; the specs are the source of truth and this plan only orders the work.

## Ground rules

- Follow `CLAUDE.md` (nvm, pnpm catalogs, Conventional Commits, generated migrations, `@repo/intl`).
- One commit per coherent step; run `pnpm lint` and `pnpm test` before each commit.
- Tests never call real AI providers, Stripe or Trigger.dev: mock them at the adapter boundary. Database tests use PGlite, as the repo already does.
- Every AI call runs in a Trigger.dev task that receives only IDs (ADR 0003). No career content in logs anywhere (privacy spec).
- Code enforces, the AI suggests: locked facts, sensitive-item choices, forbidden terms and the credit ledger are code, never prompt-only.
- When a spec is ambiguous, pick the option closest to the spec's principles, note the assumption in the commit body, and keep going. Do not change specs or ADRs without saying why in the commit.

## Environments

- Production runs on `storytorole.vercel.app` (a Vercel project domain; `APP_URL` is a Vercel Production env var), staging on `stg-storytorole.vercel.app` and each PR on `pr-<number>-storytorole.vercel.app` (aliases set by the workflows, which pass `APP_URL`).
- Stripe runs on the sandbox in production too until the Stripe account is verified (nobody uses the app yet); then production switches to live keys and a live webhook destination at `https://storytorole.vercel.app/api/webhooks/stripe`.
- With no custom domain, Clerk's production instance runs through its auto-proxy at `/__clerk`, which the Next.js proxy matcher routes. Custom email templates, email links and invitations need a custom domain.
- Moving to a custom domain later: add it to the Vercel project, create the DNS records Clerk asks for, update the production `APP_URL`, and point the production Stripe and Clerk webhooks at it.

## Slice 1: Foundation

Goal: the plumbing every later slice relies on.

- Remove the inherited Clerk Organizations sync: `organizations` and `organization_memberships` tables (generated migration), their webhook handlers, domain code and router entries. Keep `user.created`, `user.updated`, `user.deleted`.
- Webhook logging records only the event type and user id.
- Environment schema (`packages/common/src/env/web.env.ts`) already declares `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (standard Upstash names, set by hand on Vercel; `Redis.fromEnv()` reads them), `REDIS_KEY_PREFIX` (prefix for every Redis key; required when `NEXT_PUBLIC_ENV=preview`, where the staging and PR workflows pass `stg:` and `pr-<number>:`, empty elsewhere), `TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STORAGE_DRIVER` (default `vercel-blob`) and `BLOB_READ_WRITE_TOKEN`. Still to do: the app refuses to start with `STORAGE_DRIVER=local` unless `NEXT_PUBLIC_ENV=development`, or with `vercel-blob` and no `BLOB_READ_WRITE_TOKEN`.
- Storage interface (put, get, delete) with `local` (git-ignored `.storage/`) and `vercel-blob` drivers.
- Per-user envelope encryption utilities (AES-256-GCM, master key in its own env var with a version) for career content and bring-your-own keys.
- Trigger.dev 4.8.5, the latest at planning time; confirm with `pnpm view trigger.dev version` before installing (`trigger.dev`, `@trigger.dev/sdk`, `@trigger.dev/build` in the `api` catalog; `@trigger.dev/react-hooks` in `web`), `packages/api/trigger.config.ts` modeled on the adc-monorepo setup, `trigger:dev` script, a `tasks` table storing run ids, and Realtime subscription in the web app.
- Provider package abstraction with the Anthropic package (Haiku 5.5 classification, Sonnet 5.5 writing, Opus 5.5 maximum level); every call records token usage.
- Topic gate that follows the AI funding (user's key with key funding, StoryToRole's key with credits) and fails closed, and rate limits with `@upstash/ratelimit` (local SRH via `docker compose up -d`).
- Workspace shell (workspace spec), modeled on the Claude app: sidebar with My career, Library, New opening and openings by status; chat center; side panel; interface language via `@repo/intl`. Account settings use Clerk's own components, as adc-monorepo does (`apps/web/src/domains/user/components/user-button.tsx`): a Clerk `UserButton` in the sidebar footer with `userProfileMode="modal"`, and StoryToRole's own sections (plan and credits, bring-your-own keys) as `UserButton.UserProfilePage` pages inside that modal. The shell replaces the temporary sign-out button on the dashboard (`apps/web/src/app/app/page.tsx`).
- Brand assets. The mark is four straight lines with round caps (stroke 7 in a 64×64 viewBox) whose ends trace an S, the last line in the accent color ending in a dot:
  - Lines (x1 → x2 at y): 21 → 48 at 13, 11 → 35 at 26, 22 → 52 at 39, and the accent line 10 → 41 at 52 with a dot at (52.5, 52), r 4.75.
  - Colors: ink `#15171C` and accent `#D9480F` on light; `#F6F6F3` and `#FF8A4C` on dark.
  - Lockup: the mark plus "StoryToRole" in Space Grotesk 600, one color.
  - Favicon and app icon: the mark in white on an accent rounded square, the upper lines at 65% opacity; at 16 and 24 px a three-line cut (24 → 50 at 16, 11 → 37 at 32, the accent line 10 → 38 at 48 with a dot at (53, 48), stroke 10).
  - Ship `apps/web/src/app/icon.svg`, `apps/web/src/app/apple-icon.png`, the mark and lockup SVGs (light and dark) in `apps/web/public/brand/`, and the lockup in the workspace shell.

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
- Interview and interface languages, browser voice input (Web Speech API, transcribed by Google in Chrome and Edge and by Apple in Safari; OS dictation hint otherwise).

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

## Final pass

After slice 7, before calling the MVP done. Raised by the owner while testing slices 1 to 4.

- Interface translations: switching the interface language today changes only date and number formats; translate every `@repo/intl` message into Brazilian Portuguese.
- Import of the owner's own files (a resume plus a truth file): confidentiality rules written in the truth file ("names of people, colleagues and clients included", "salary and billing figures") became sensitive items instead of being applied to the real names; annotations such as "[medido]" leak into evidence text; facts in two languages (resume in English, truth file in Portuguese) make review confusing.
- Per-application sensitive-item overrides (guided-interview spec, "Per-application overrides"; listed in the workspace Context block): in the specs but in no slice yet.
- A guided walkthrough of every flow with the owner, using the product as a user.
- Evaluate an optional product tour that teaches new users the system.
- Privacy decisions raised in slice 7b, decided: nothing of a deleted account is kept (signing up again grants welcome credits again; remaining credits are lost, as the deletion dialog warns), and the Stripe customer is deleted with the account (charges and invoices stay in Stripe). Neon's history window, 6 hours on the Free plan, is stated in the deletion notice; changing plans means updating `privacySettings.databaseHistoryHours`.

Acceptance:
- [ ] Switching the interface to Brazilian Portuguese translates every screen.
- [ ] Importing a resume and a truth file yields sensitive items that are real names or figures, and evidence without annotations.
- [ ] A sensitive item can be kept, generalized or excluded for one application only.

## Walkthrough fixes

Found with the owner in the guided walkthrough (2026-11-16), stopped after the first resume import so the career interview is tested only once these are fixed. Each group is one slice.

### W1: Quick fixes on My career

- Hide the side panel until the privacy notice is acknowledged, and refuse imports on the server before it (today only the interview checks it).
- Remove the sample-task card ("Background tasks").
- Import sits at the top of the side panel, above the timeline.
- Credentials split into Education, Languages and Certifications, each with its own "+ Add"; courses, publications, awards and volunteering go under "Courses, publications and more", shown only when it has items (Education's "+ Add" also offers those kinds, so the first one can be added). The resume already has a section per kind.
- The credit meter refreshes after an import (uploads skip the tRPC invalidation).
- Plural messages handle zero in Brazilian Portuguese ("0 fato" reads wrong): every pt-BR plural has an `=0` case, since Portuguese's `one` category covers zero.

Acceptance:
- [ ] Before the notice, the side panel is hidden and an import request is refused.
- [ ] The meter shows the import's cost as soon as it settles.

### W1b: Sources

Raised by the owner during W1: most users have a few resume versions, a LinkedIn PDF or a summary their own AI wrote, rarely a truth file.

- "Import" becomes "Sources": one upload button plus a drop zone for dragged files; no resume or truth-file choice. The import task works out the kind itself (rules such as "do not include" make it a truth file).
- Up to 5 sources per user, counted on the server (rejected or failed files don't count); a source can be removed to free its slot, keeping the evidence already approved from it.
- Clicking a source opens a preview in a panel further right, as the Claude app does: PDFs as they are, DOCX as their extracted text, Markdown and text as text. Files stay in the platform's storage, encrypted, readable only by their owner through an authenticated route.

Acceptance:
- [ ] Dropping three resumes and a summary imports all four with no kind chosen; a sixth file is refused.
- [ ] Clicking a source shows its contents beside the panel; another user gets 404 for it.

### W1c: Resizable chat and preview

Raised by the owner after W1b.

- With a source's preview open, the dividers on both sides of the side panel can be dragged to resize the chat and the preview; the side panel (sources and timeline) keeps its width.
- Each screen remembers the split per viewer (browser storage, a convenience only); the chat and the preview keep a usable minimum width.
- A plain draggable divider, so the chat is never remounted when a preview opens or closes (its draft and scroll stay).
- In Sources, the uploaded files are listed above the upload area.

Acceptance:
- [ ] Dragging the border widens the preview and narrows the chat; a reload keeps the split.

### W2: One career chat on chat.agent

The guided-interview spec already asks for "one conversation; a light orchestrator and one short-lived agent context per position". Slice 2 built the position agents but exposed one conversation per position.

- My career is always a chat: the message box is always there; its empty state is the introduction with shortcuts to import a resume, a LinkedIn PDF or a truth file, or add a position; "I have no positions yet" stays above the box while there are no positions.
- One orchestrator routes each message to the right position agent (several when a message covers several positions); the user sees which positions are being worked on and how many agents are running. A position card's "Interview" becomes a shortcut that focuses the same chat on it.
- Built on Trigger.dev `chat.agent` (`@trigger.dev/sdk/ai`), with live token streaming, sub-agents through `ai.toolExecute`, a `TranscriptStorage` writing encrypted turns to our tables (evidence keeps pointing at its source turn) and `loadContext` giving each agent only its slice. The provider layer (own key, credits, token accounting, topic gate, sensitive filter) moves onto the Vercel AI SDK.
- Privacy: message content passes through Trigger.dev session streams for their retention window. A new ADR amends ADR 0003, the privacy notice and spec say so, and account deletion removes the sessions if Trigger.dev allows it. Check the retention window and trace redaction first.

Acceptance:
- [ ] One message about two positions saves draft facts to both, and the chat shows both agents working.
- [ ] A reload mid-answer resumes the stream; transcripts stay in our database, encrypted, and are purged as before.

### W3: Reviewing what the AI understood

- Each position shows "what the AI understood": a short summary in the AI's voice, plus every extracted fact with its quote, before approval (today summaries exist only after approval).
- Counts show imported facts waiting for review ("6 facts to review") instead of "0 facts".
- The position's status (pending, approved) is shown apart from its depth level, and each depth level is explained.
- The bulk approval states how many positions and facts it approves, that they were not reviewed, that they can be reviewed later, and which positions it skips because of conflicts.

### W4: AI at work feels alive

- One shared "AI at work" component: live, specific narration of each step ("Found 6 positions", "Extracting achievements at Initech…"), results appearing as they are found, and motion. No static "Reading…" label.
- Used by import (prominent in the center, saying the user can leave), fit check, company research, generation and adaptation. Tasks report meaningful steps.
- Built: steps and counts for import, fit check, research and resume generation (keys and numbers only in Realtime metadata, worded by the interface); the shared component for every other AI wait. Later: results appearing one by one (position names, requirements) read from the database while the task runs, the import card in the chat column, and steps for adaptation and the cover letter.

### W5: Career language

- The interview language leaves the privacy notice and the empty state. It is asked at the right moment (first import or first message), explained as the language the evidence is stored in, and defaults to the language of the imported files, else the interface language; it stays changeable in the chat. A column records who set it (`interviewLanguageSource`: the first file or the user), so two files imported at once can't both switch it; profiles that went through the privacy notice count as chosen.
- Generation gets each file fact's original wording (author notes removed, sensitive filter applied), to prefer when the document is in that language; it also backs the line's figures. Resumes and cover letters.

## Not in the MVP

Hiring interview prep, team or recruiter accounts, email reminders, OpenAI package and "Sign in with ChatGPT", languages beyond English and Brazilian Portuguese, final prices.
