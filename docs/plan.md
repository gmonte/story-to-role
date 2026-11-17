# StoryToRole implementation plan

How to build the MVP described in `docs/specs/`, in vertical slices. Each slice ends usable end to end, with its acceptance criteria passing. Read `GLOSSARY.md` and the ADRs in `docs/adr/` before starting; the specs are the source of truth and this plan only orders the work. The career engine is being rebuilt around one profile document (ADR 0008, [profile-truth.md](./specs/profile-truth.md)): the ADRs and specs describe the target, and until the profile_truth slices land, the code still disagrees with them in places; each slice brings its part in line.

## Ground rules

- Follow `CLAUDE.md` (nvm, pnpm catalogs, Conventional Commits, generated migrations, `@repo/intl`).
- One commit per coherent step; run `pnpm lint` and `pnpm test` before each commit.
- Tests never call real AI providers, Stripe or Trigger.dev: mock them at the adapter boundary. Database tests use PGlite, as the repo already does.
- Every AI call runs in a Trigger.dev task that receives only IDs (ADR 0003). No career content in logs anywhere (privacy spec).
- Code enforces, the AI suggests: locked facts, figure marks, communication rules and the credit ledger are code, never prompt-only.
- When a spec is ambiguous, pick the option closest to the spec's principles, note the assumption in the commit body, and keep going. Do not change specs or ADRs without saying why in the commit.

## Environments

- Production runs on `storytorole.vercel.app` (a Vercel project domain; `APP_URL` is a Vercel Production env var), staging on `stg-storytorole.vercel.app` and each PR on `pr-<number>-storytorole.vercel.app` (aliases set by the workflows, which pass `APP_URL`).
- Stripe runs on the sandbox in production too until the Stripe account is verified (nobody uses the app yet); then production switches to live keys and a live webhook destination at `https://storytorole.vercel.app/api/webhooks/stripe`.
- With no custom domain, Clerk's production instance runs through its auto-proxy at `/__clerk`, which the Next.js proxy matcher routes. Custom email templates, email links and invitations need a custom domain.
- Moving to a custom domain later: add it to the Vercel project, create the DNS records Clerk asks for, update the production `APP_URL`, and point the production Stripe and Clerk webhooks at it.

## Done so far

The first engine, built slice by slice, then reworked in the owner's walkthrough. What is listed here as "replaced" leaves the product in C0.

- **Slice 1, foundation** (`checkpoint/03`): Clerk webhooks without organizations, environment schema, storage drivers, per-user envelope encryption, Trigger.dev with Realtime, the provider package abstraction, the topic gate and rate limits, the workspace shell, brand assets. Kept.
- **Slice 2, career base** (`checkpoint/04`): resume and truth file import, the guided interview with an orchestrator and position agents, extraction approval, evidence, sensitive items, credentials, depth. Replaced by the profile.
- **Slice 3, openings and fit check** (`checkpoint/05`): openings by text or link, local embeddings, the hybrid fit check. Kept, adapted in P5.
- **Slice 4, resume generation** (`checkpoint/06`): applications, instructions, locked-fact overrides, review rounds, documents, versions, snapshots, adaptation, language sync, PDF rendering, library documents. Kept, adapted in P6 and P7.
- **Slice 5, cover letter** (`checkpoint/07`): company research, motivation interview, story choice, storytelling. Kept, adapted in P8.
- **Slice 6, credits and billing** (`checkpoint/08`): the credit ledger, Stripe, packs, courtesy grants, bring-your-own keys. Kept.
- **Slice 7, tracker, privacy and onboarding** (`checkpoint/09`): tracker, export and deletion, onboarding paths. Kept, adapted in P9.
- **Walkthrough fixes W1–W5** (`checkpoint/10` to `checkpoint/22`): sources with preview, resizable panes, the career chat on `chat.agent`, review of what the AI understood, the "AI at work" component, the chat reacting to imports and side-panel changes, folding repeated facts, the position space, the career language. The sources, panes, the "AI at work" component and `chat.agent` stay; the rest is replaced by the profile.
- **A1, position accounts** (`checkpoint/23`): merged, then superseded by the profile before any later slice.

## profile_truth engine

The meu-emprego-novo method in the product (ADR 0008): the profile document, its editor and agent, screening, generation, coverage review and tracking per the method. Each slice is one PR to `staging`, reviewed on standards and spec, merged after its checks, then tagged.

### Docs

- ADRs 0001, 0003, 0004, 0006 and 0007 rewritten for the profile; ADR 0008 replaced; specs `profile-truth.md` and `ai-platform.md` added, `guided-interview.md` and `position-accounts.md` removed; `resume-and-cover-letter.md`, `tracker.md`, `privacy.md`, `workspace.md`, `billing.md`, the glossary and this plan updated.

### C0: Clean slate

- Remove the old engine, code, tables and Trigger.dev tasks: the guided interview (sessions, turns, draft facts, approval screen), the career chat's orchestrator and per-position agents, career events and reactions, position summaries, narratives, cross notes, timeline proposals, position accounts, the position space, evidence, stories and skills. Keep the profile anchor, sources, users, credits, billing, openings, documents, applications, tracker, tasks and encryption, with whatever reads the removed tables stubbed until its slice adapts it.
- Squash every migration into one baseline generated from the remaining schema (idempotent as usual); rebuild the local and staging databases from scratch with it. All their data is lost, which is fine: nothing runs outside local and staging yet.
- The owner recreates their Clerk user while ngrok forwards the webhook (say when it's running); the test users used in live checks are recreated after asking.
- Note: the career chat's `chat.agent` transport (the agent task, encrypted transcript storage, the 7-day purge and closing sessions on account deletion) went with the old chat; P3 rebuilds it from git history as the profile agent.
- Note: `positions`, `credentials`, `sensitive_items` and `career_goals` stay on purpose until P5, P6 and P8 move their readers to the profile; until then the `evidence` domain folder holds only the last two.

Acceptance:
- [ ] No table, task, route or component of the old engine remains; `pnpm lint` and `pnpm test` pass.
- [ ] A fresh database built from the baseline passes the migrations test; a recreated Clerk user gets a local user and welcome credits through the webhook.

### P1: The profile editor

- A small prototype first: a TipTap/ProseMirror block editor whose Markdown round trip is lossless for the template.
- My career becomes the editor: index, document, agent panel. The template with hints for a new profile; the "+" and `/` insert menu for each section type, in place and format, with date and status pickers; autosave of the draft and undo.
- The linter (format and content rules, in the browser and on the server) marking findings in the text; "Fix format" per finding and for the whole document; published versions read, compared and restored.

Acceptance:
- [ ] A new profile starts from the template; each insert lands in its section, in format.
- [ ] Findings are marked as the user types; "Fix format" corrects what it can and leaves the rest marked.
- [ ] The downloaded file is the method's `profile_truth.md`.

### P2: Validate and publish

- One button, two steps: Validate (an AI review of what changed since the last published version, the user's credits, estimate first; findings on their passages with "Talk about this"; competency levels proposed) and Publish (a numbered version; with or without validating; format errors block, quality findings don't).
- The extracted structure of each published version (experiences with locked facts, credentials, competencies by level, languages, gaps, communication rules, marked figures) and its passages' embeddings.

Acceptance:
- [ ] Validating reviews only the changed sections and is charged; publishing creates a version even with open findings; a format error blocks it.
- [ ] A published version's extract and passages are what the rest of the product reads.

### P3: The profile agent

- One agent per user on `chat.agent` (ADR 0007): a selected passage or a finding's "Talk about this" reaches it as a quote; each turn carries the passage, its section, the index, the known gaps and the communication rules; a tool reads other sections.
- It interviews per the method (at most three questions per message, never suggesting numbers, figure origins and what the user did not do asked) and changes the profile only through suggestions shown in place, accepted or rejected one by one or all at once; "Interview me" fills a new profile the same way. Charged per message.

Acceptance:
- [ ] Selecting a passage opens the agent with it; its suggestions show as tracked changes and only accepted ones reach the draft.
- [ ] The agent never sends more than three questions in a message and never proposes a figure the user didn't give.

### P4: Importing as suggestions

- A resume, LinkedIn PDF or truth file writes the first draft of an empty profile, or proposes only what an existing one lacks; figures from a resume arrive as `[a confirmar]`; disagreements arrive side by side; a truth file's rules arrive as communication-rule suggestions; the agent sums up what was proposed and what is missing.

Acceptance:
- [ ] A file that only restates the profile proposes nothing; one with a new fact proposes only that.
- [ ] Imported figures are `[a confirmar]` and stay out of generated documents until resolved.

### P5: Job preferences and screening

- The job preferences document in the same editor (work model, locations, salary range, excluded companies and sectors, discard rules), versioned, read only by screening; excluding a company from an opening or the tracker adds it.
- The fit check per method 03 on the published profile: high, medium or low; each requirement with the passage that backs it; "studied", what-I-didn't-do and known gaps as gaps; a broken preference makes it low; warning signs shown.

Acceptance:
- [ ] A requirement the profile marks as "studied" or "did not do" is a gap; an excluded company makes the band low.
- [ ] Every met requirement links to a profile passage.

### P6: Generation per the method

- Prompts 04 (a new version for a family: the library document with focus) and 04b (an adjustment: only bullets' order, competencies' order and the summary) from the published profile, frozen in each document; only `[medido]` figures; the review loop judging coverage; the emphasis list (or what changed) after each generation.
- The generation settings form, prefilled with the user's defaults (3 bullets on recent experiences up to 5 years, 1 on older ones, 15+ years only when relevant to the document's purpose, resume up to 2 pages, letter up to 4 paragraphs and 1 page), enforced in code after rendering, shortening in the specified order.

Acceptance:
- [ ] A React Native library resume brings mobile achievements forward; a general one each experience's strongest points.
- [ ] An `[estimado]` or `[a confirmar]` figure never appears; a very old experience appears only with the requirement that justified it; the length rules hold.

### P7: Coverage review

- Every generated document gets the method's coverage review against its frozen profile, in its price: code checks that block (locked facts, counts and pages per the form, `[medido]` figures, communication rules, what the user did not do, very old experiences) and the AI part (strong and partial coverage with passages, gaps not invented, inconsistencies, the final statement); an omitted true fact becomes a profile suggestion.

Acceptance:
- [ ] A document with a figure the profile doesn't mark `[medido]` is blocked.
- [ ] The review never suggests covering a gap and ends with the method's statement.

### P8: Cover letter, instructions and gap answers

- The cover letter reads the frozen profile, the motivation interview and company research; new career direction becomes a profile suggestion; it follows the settings and gets the coverage review.
- Application instructions stay per application; "send to my profile" and gap-question answers become profile suggestions; a confirmed gap goes to "what I did not do" or Known gaps.

Acceptance:
- [ ] Promoting an instruction creates a suggestion in the profile's draft, not a change.
- [ ] Confirming a gap suggests it for "what I did not do" or Known gaps.

### P9: Tracking per the method

- The method's fields (source, application type, resume version sent, next step, the user's decline reason, which can become a preference rule) and its metrics (response rate per resume version and per source, time to first response, high-fit openings that reached an interview); recruiter contacts encrypted and never in prompts.

Acceptance:
- [ ] Sending a document from StoryToRole records its version on the application; the metrics count it.

### P10: LinkedIn

- The method's step 09, built like a general library document: a LinkedIn profile (headline, about, experiences) generated from the published profile, with the same rules and coverage review. Specified before it starts.

## Final pass

After P10, before calling the MVP done. Raised by the owner while testing the first engine; what concerned the evidence base (sensitive items from a truth file, annotations leaking into evidence, per-application sensitive-item overrides) is covered by the profile's communication rules and figure marks.

- Interface translations: translate every `@repo/intl` message into Brazilian Portuguese, so switching the interface language changes more than date and number formats.
- A guided walkthrough of every flow with the owner, using the product as a user.
- Evaluate an optional product tour that teaches new users the system.
- Privacy, already decided: nothing of a deleted account is kept, and the Stripe customer is deleted with it; Neon's history window is stated in the deletion notice (`privacySettings.databaseHistoryHours`).

Acceptance:
- [ ] Switching the interface to Brazilian Portuguese translates every screen.

## Not in the MVP

Hiring interview prep, job search, scam guidance as a feature, the retrospective, team or recruiter accounts, email reminders, OpenAI package and "Sign in with ChatGPT", languages beyond English and Brazilian Portuguese, final prices.
