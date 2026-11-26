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
- Note: `positions`, `credentials`, `sensitive_items` and `career_goals` stayed until P5, P6 and P8 moved their readers to the profile. After P10 the leftovers were removed (migration `remove_leftover_career_tables`): those four tables, `application_overrides` (per-application sensitive-item overrides) with its router, the points' `encryptedSensitiveItems` columns, the `evidence` domain folder and the account export entries. The communication rules' "never include" filter moved to `domains/profile/rules/`. `locked_fact_overrides` and title equivalents stay.

Acceptance:

- [ ] No table, task, route or component of the old engine remains; `pnpm lint` and `pnpm test` pass.
- [ ] A fresh database built from the baseline passes the migrations test; a recreated Clerk user gets a local user and welcome credits through the webhook.

### P1: The profile editor

- A small prototype first: a TipTap/ProseMirror block editor whose Markdown round trip is lossless for the template.
- My career becomes the editor: index, document, agent panel. The template with hints for a new profile; the "+" and `/` insert menu for each section type, in place and format, with date and status pickers; autosave of the draft and undo.
- The linter (format and content rules, in the browser and on the server) marking findings in the text; "Fix format" per finding and for the whole document; published versions read, compared and restored.
- Note: since versions need publishing, P1 also ships Publish without its Validate step (format findings block it; an unchanged draft publishes nothing new). P2 adds Validate in front of it and the extract behind it.
- Note: the editor holds the profile as flat blocks, one per Markdown line (heading, paragraph, quote line, list item with its depth), so the round trip is lossless and each finding maps to its line; the official TipTap drag handle needs the Yjs collaboration packages, so the margin's "+" and handle and the `/` menu are the app's own.

Acceptance:

- [ ] A new profile starts from the template; each insert lands in its section, in format.
- [ ] Findings are marked as the user types; "Fix format" corrects what it can and leaves the rest marked.
- [ ] The downloaded file is the method's `profile_truth.md`.

### P2: Validate and publish

- One button, two steps: Validate (an AI review of what changed since the last published version, the user's credits, estimate first; findings on their passages with "Talk about this"; competency levels proposed) and Publish (a numbered version; with or without validating; format errors block, quality findings don't).
- The extracted structure of each published version (experiences with locked facts, credentials, competencies by level, languages, gaps, communication rules, marked figures) and its passages' embeddings.
- Note: an accepted competency level edits the draft directly, as one undo step (it moves a name between two lines, which a suggestion's single passage doesn't express); findings get "Talk about this" with the agent (P3).
- Note: `loadPublishedProfile` is the one reader of a published version (extract, passages, Markdown) for P5–P8.

Acceptance:

- [ ] Validating reviews only the changed sections and is charged; publishing creates a version even with open findings; a format error blocks it.
- [ ] A published version's extract and passages are what the rest of the product reads.

### P3: The profile agent

- One agent per user on `chat.agent` (ADR 0007): a selected passage or a finding's "Talk about this" reaches it as a quote; each turn carries the passage, its section, the index, the known gaps and the communication rules; a tool reads other sections.
- It interviews per the method (at most three questions per message, never suggesting numbers, figure origins and what the user did not do asked) and changes the profile only through suggestions shown in place, accepted or rejected one by one or all at once; "Interview me" fills a new profile the same way. Charged per message.

- Note: a suggestion is a `ProfileChange` (a part's key, the lines it replaces, the lines it writes) plus its reason; it is located again in the text as the user edits, and one whose lines were edited away can only be rejected; a newer suggestion on the same lines supersedes the one waiting. Two rules are code, not prompt: a reply is cut after its third question mark, and a suggestion with a number found neither in the profile nor in the user's messages is refused. A message about a passage carries it as leading `> ` quote lines.
- Note: profile work (agent messages, validation) never spends the Free plan's credit reserve, as the interview didn't.
- Note: a turn reserves its credits before the topic gate runs, since the gate's call is part of the message's cost (as the old chat did): an off-topic message with no credits left gets the out-of-credits reply. The figure rule compares numbers, not their meaning: a percentage must be given as one, but a number given for one thing can be proposed for another, which the user sees in the tracked change before accepting it.
- Note: validation's competency levels stay in the review panel (accept or reject there); they are not `profile_suggestions` rows.

Acceptance:

- [ ] Selecting a passage opens the agent with it; its suggestions show as tracked changes and only accepted ones reach the draft.
- [ ] The agent never sends more than three questions in a message and never proposes a figure the user didn't give.

### P4: Importing as suggestions

- A resume, LinkedIn PDF or truth file writes the first draft of an empty profile, or proposes only what an existing one lacks; figures from a resume arrive as `[a confirmar]`; disagreements arrive side by side; a truth file's rules arrive as communication-rule suggestions; the agent sums up what was proposed and what is missing.

- Note: an import is one comparison of the file's text with the draft (`import_document`, one at a time per user, cap 30 credits) whose changes become `profile_suggestions` with origin `import`; an empty profile's first draft arrives the same way. Code drops a change with no passage of the file behind it, one that restates a line, or one that rewrites a line whose figure the user marked. A source keeps its import state (`importStatus`, the summary the agent says once).
- Note: the guided start ("I have an opening in mind") sends the user to My career to review and publish the first draft before the opening (ADR 0006); P5 makes the fit check read the published profile.
- Note: an import sees the suggestions still waiting and completes one instead of repeating it; imports hold the Free plan's credit reserve like the agent and validation; the acceptance's second half (imported figures staying out of generated documents) is met when P6 reads only `[medido]`.

Acceptance:

- [ ] A file that only restates the profile proposes nothing; one with a new fact proposes only that.
- [ ] Imported figures are `[a confirmar]` and stay out of generated documents until resolved.

### P5: Job preferences and screening

- The job preferences document in the same editor (work model, locations, salary range, excluded companies and sectors, discard rules), versioned, read only by screening; excluding a company from an opening or the tracker adds it.
- The fit check per method 03 on the published profile: high, medium or low; each requirement with the passage that backs it; "studied", what-I-didn't-do and known gaps as gaps; a broken preference makes it low; warning signs shown.

- Note: the fit check reads only the published profile and the published preferences. An opening added before any profile is published is kept with its requirements and waits; the user runs the check after publishing, and a check made on an older version of either offers to run again. A rerun keeps the opening's requirements and the gap answers, and judges again.
- Note: passages carry a kind (evidence, studied, known gap, not done, rule) and only evidence is retrieved. Code keeps the rules: a met or partial verdict needs a cited passage (location and work model are answered by the preferences), a short term that a studied competency or a short gap line names is a gap (the judge points at the line for the rest), and the band comes from the mandatory requirements. With no preferences published, location and work model are shown as unknown and stay out of the band.
- Note: a broken preference is found three ways: the excluded company and an excluded sector the posting names by code, the other lines by a small call of their own that answers with the line's number, so the rule shown is the user's own text. Excluding a company publishes only that company (preferences never published start from the template). Excluding a company from the tracker comes with P9.

Acceptance:

- [ ] A requirement the profile marks as "studied" or "did not do" is a gap; an excluded company makes the band low.
- [ ] Every met requirement links to a profile passage.

### P6: Generation per the method

- Prompts 04 (a new version for a family: the library document with focus) and 04b (an adjustment: only bullets' order, competencies' order and the summary) from the published profile, frozen in each document; only `[medido]` figures; the review loop judging coverage; the emphasis list (or what changed) after each generation.
- The generation settings form, prefilled with the user's defaults (3 bullets on recent experiences up to 5 years, 1 on older ones, 15+ years only when relevant to the document's purpose, resume up to 2 pages, letter up to 4 paragraphs and 1 page), enforced in code after rendering, shortening in the specified order.

- Note: a generation freezes, when it is asked for, the profile version published then and the settings chosen in the form; nothing is generated before a profile is published. Generation reads that version line by line: a position's id is derived from its employer, title and start (the `positions` and `credentials` tables lose their last readers here; instructions and overrides still point at them until P8), a line's figures count only where the profile marks them measured (an estimated, unconfirmed or unmarked result figure is withheld from the writer and refused by code), and "what I did not do", known gaps, studied competencies and the rules never reach it as evidence. The header comes from the profile's identity and contact.
- Note: the communication rules' "never include" list replaces sensitive items as the filter code applies before and after every AI call.
- Note: "Adjust" (04b) is the old "use as reference": the model names the reference's bullets and competencies in a new order, writes a summary and may add a bullet the profile has; code keeps every other word. It runs no review round. The review loop rates a draft by how much of its purpose it covers, leaving the fit check's gaps out of the count.
- Note: what code enforces on every written line (generated, kept by an adjustment or carried into one): it cites profile lines or instructions; its numbers are ones those lines show as measured (a percentage only as one); it names no competency the profile marks studied, no "never claim" or "never include" term, no placeholder or figure mark; locked facts and the target title are printed by code. What only the prompt asks, until the coverage review (P7) checks it: not claiming in other words what a position says the person did not do, or a known gap written as free text.
- Note: each snapshot carries the profile version its content was written from (a generation's, then inherited by edits, copies, restores and adaptations); adapting and copying read that version, and the cover letter reads its resume's.
- Note: the lines' trace back to the profile in the editor comes with the coverage review (P7); the cover letter's length settings are stored now and enforced in P8; a user's own edits get the length warning, not shortening. Acceptance 1 (a React Native library resume brings mobile achievements forward; a General one each experience's strongest points) is a prompt instruction, checked live, not by a test.

Acceptance:

- [ ] A React Native library resume brings mobile achievements forward; a general one each experience's strongest points.
- [ ] An `[estimado]` or `[a confirmar]` figure never appears; a very old experience appears only with the requirement that justified it; the length rules hold.

### P7: Coverage review

- Every generated document gets the method's coverage review against its frozen profile, in its price: code checks (locked facts, counts and pages per the form, `[medido]` figures, communication rules, what the user did not do, very old experiences; since D4 they point out and never block) and the AI part (strong and partial coverage with passages, gaps not invented, inconsistencies, the final statement); an omitted true fact becomes a profile suggestion.

- Note: the code checks are not stored: they run live on each resume version's official snapshot, against the profile version that snapshot froze (the one published now when it carries none), the settings of the generation that wrote the version and the opening's requirements (or the focus), so a user edit that adds an unmarked figure shows a finding at once. A rendered PDF's measured pages count when the file exists; the estimate before. Every finding blocks the document from leaving the platform (the PDF download, the application's ZIP and marking the application as sent refuse it); the editor's preview is not blocked. "What I did not do" is checked by the names the profile knows (competencies, studied competencies and the tools of every experience), never on free text, and only for lines of that position.
- Note: the AI part runs once per generation (a new version or an adjustment), on the final content, in the generation's price, and is not run again after edits: the view says which snapshot it reviewed and whether that is the official one. It sees the resume with its line ids, the requirements with the fit check, the profile lines the document cites plus the fit check's, and the instructions, never the whole profile. Code keeps a strong item only when its line is in the document and its profile line is of the frozen version and cited by that line or tied by the fit check to that requirement (else it is partial, "no evidence in the profile"); every requirement left is a gap; a suggestion naming a gap, or a reorder asking to add or claim anything, is dropped; a "profile" suggestion is kept only for a bullet resting on the user's own words (an instruction or a manual edit). Code writes the sources, what was preserved and the final statement.
- Note: "send to my profile" takes a kept "profile" suggestion and proposes the bullet under the Results of its experience in the current draft (origin `application`); the experience is found by the position's derived id, so a renamed one is refused rather than guessed. The cover letter's review comes with P8; the trace in the editor now reads the frozen version's lines.

Acceptance:

- [x] A document with a figure the profile doesn't mark `[medido]` is pointed out (blocked until D4, which made every check a warning).
- [x] The review never suggests covering a gap and ends with the method's statement.

### P8: Cover letter, instructions and gap answers

- The cover letter reads the frozen profile, the motivation interview and company research; new career direction becomes a profile suggestion; it follows the settings and gets the coverage review.
- Application instructions stay per application; "send to my profile" and gap-question answers become profile suggestions; a confirmed gap goes to "what I did not do" or Known gaps.

- Note: the cover letter freezes, when it is asked for, the profile version (its resume's, when it has one, so the lines they cite are the same; else the one published now; nothing is generated before a profile is published) and the settings of the form, and reads that version through the same context as a resume: its facts come only from the frozen profile's lines (the chosen story, those its resume and the fit check cite, the career direction), the application's instructions, the motivation points and the approved company facts. A paragraph cites its sources, carries only figures those sources show (a profile line's figures count only where it marks them measured, as in a resume; no mark or placeholder) and names nothing the rules forbid or a position says the person did not do; code refuses it otherwise. After rendering, a letter over `letterMaxParagraphs` or `letterMaxPages` is rewritten to fit (two rounds; if it still runs over, the live check blocks it). The snapshot carries `profileVersionId`.
- Note: the letter's coverage review is the resume's: the code checks run live on the official snapshot (paragraphs and pages per the settings, figures, communication rules, what the user did not do) and ask for a confirmation before the download, the ZIP and marking as applied (they blocked until D4); the AI review runs once per generation, in its price, through the same `keepReview`, adapted to paragraphs. A `profile` suggestion is kept only for a paragraph resting on an instruction with a position, and "send to my profile" proposes that instruction's statement (never the paragraph) under that position's Results.
- Note: the story choice ranks the profile's results lines by the similarity of their passages to the opening's vector (in profile order when a passage isn't embedded yet) and offers the top three with the requirements each answers (the fit check's, then those its words name); the pick is `storyLineId`, validated against the version published now and found again by its words in the resume's version. The motivation interview takes it too, to ask about its turning point.
- Note: nothing from the user reaches the profile except as a suggestion in its draft (origin `application`), found by the position's derived id: a saved motivation point about the user goes under the career direction line of Professional identity, a saved detail of the story under its position's Results, an instruction sent to the profile under its position's field (results, responsibilities or tools by its kind) or, with no position, under the career direction line of Professional identity, and a gap the user confirms lacking under the chosen position's "what I did not do" or Known gaps (a gap has no passage of the profile, so the user names the position or leaves it to Known gaps). A line the draft refuses (it has it already, or no longer has the place) stays in the application. The career goals table is no longer read or written; dropping it waits for the final cleanup.

Acceptance:

- [ ] Promoting an instruction creates a suggestion in the profile's draft, not a change.
- [ ] Confirming a gap suggests it for "what I did not do" or Known gaps.

### P9: Tracking per the method

- The method's fields (source, application type, resume version sent, next step, the user's decline reason, which can become a preference rule) and its metrics (response rate per resume version and per source, time to first response, high-fit openings that reached an interview); notes and next steps (free text, where names and contacts end up) are encrypted and never reach a prompt: anything the AI reads of the tracker is its structured fields.

Notes (decisions the spec left open):

- Response: the company responded when the application ever reached In process, Offer, Hired or Rejected (a rejection is an answer); Withdrawn and No response are not responses. Interview: reached In process or beyond (In process, Offer, Hired), the closest structured signal since In process covers screening, interview or test. Time to first response is the median (not the average the spec's older wording says) of days from applying to the first such status change on the timeline; an application created already past Applied has no dated response and stays out of the median. Defined in `tracker/metrics.ts`.
- Periods filter by the day applied: last 30 days, last 90 days, all. High-fit uses the band of the opening's latest fit check. Metrics read only structured fields; nothing calls an AI.
- Resume sent: from the submissions when sent from StoryToRole; for one sent with nothing from StoryToRole, picked by hand among the user's resume versions (no foreign key, a deleted version stops resolving). Applications with no resume recorded are grouped as “Not recorded”.
- Source is a short list plus free text (shown for “Other”); the free text, notes, next step and decline reason are encrypted, and a test fails if any file outside the tracker reads them. The opening's own notes (unsolicited openings) are a different field and unchanged.
- A decline reason becomes a discard rule, and the company is excluded from the tracker, by the same direct path as excluding a company from an opening: the line is added to the preferences draft and published alone (`ProfileService.addDiscardRule` / `excludeCompany`). The reason's line breaks become spaces; a rule already present is not added twice.
- The next step also shows with the follow-up and “No response” soon reminders.

Acceptance:

- [x] Sending a document from StoryToRole records its version on the application; the metrics count it.

### P10: LinkedIn

- The method's step 09, built like a general library document: the LinkedIn "About" and each experience's text, generated from the published profile with the same rules and coverage review, charged as a generation (resume spec, "LinkedIn").

Acceptance:

- [x] The LinkedIn text uses only the frozen profile: a figure the profile doesn't mark `[medido]` is pointed out (blocked until D4), and every experience keeps its locked facts.
- [x] Each section has a copy action; nothing is changed on LinkedIn by StoryToRole.

Notes:

- A `linkedin` document kind (one per user, library-style, a version per language) whose content is `{about: Line, experiences: [{positionId, employer, title, startDate, endDate, lines}]}`; the About is one line with its paragraphs separated by a blank line. No migration: `documents.kind` is text.
- No second rule set: code views the text as a resume (About as summary, experiences as the experience section) and reuses `assembleResume`, `checkDocument`, `keepReview` and the coverage review. Very old experiences under “relevant only” are left out, since a general text has no requirement to justify them.
- One writer call and the coverage review against the focus “career as the profile states it”; charged as `generate_document` priced like a cover letter (20 × level).
- Copying is gated on the server (`linkedin.sectionText` asks for a confirmation while the official snapshot has open findings; it refused them until D4); no PDF or other export exists for it.

## Final pass

After P10, before calling the MVP done. Raised by the owner while testing the first engine; what concerned the evidence base (sensitive items from a truth file, annotations leaking into evidence, per-application sensitive-item overrides) is covered by the profile's communication rules and figure marks.

- Interface translations: translate every `@repo/intl` message into Brazilian Portuguese, so switching the interface language changes more than date and number formats.
- A guided walkthrough of every flow with the owner, using the product as a user.
- Evaluate an optional product tour that teaches new users the system.
- Privacy, already decided: nothing of a deleted account is kept, and the Stripe customer is deleted with it; Neon's history window is stated in the deletion notice (`privacySettings.databaseHistoryHours`).

Acceptance:

- [ ] Switching the interface to Brazilian Portuguese translates every screen.

## Document workspace

The resume and the cover letter edited like the profile, with an agent per document (ADR 0009, [resume-and-cover-letter.md](./specs/resume-and-cover-letter.md#document-workspace)). Asked by the owner during the walkthrough. Same rules as the profile_truth slices: one PR per slice to `staging`, merged after its checks, then tagged.

### D1: The document in its PDF look, editable

- The workspace layout (index and findings, document, side panel with preview and versions) for resumes and cover letters, library and application.
- A snapshot's structured content as editor blocks styled like the PDF (header and section titles locked, employer, title and dates locked), and blocks back to structured content; edits save as coalesced snapshots (origin edited, author user). Trace on hover as today.
- Findings (code checks, coverage review) as underlines with the hover card: Fix where code fixes it, Ignore.

Acceptance:

- [ ] A generated resume and a cover letter open in the PDF look; editing a bullet saves a snapshot and the PDF preview shows it.
- [ ] Locked facts and section titles can't be edited in place.

### D2: The document agent

- One agent per document on `chat.agent`, sharing the profile agent's plumbing (sessions, recovery, New conversation, `/clear`, attachments, autocomplete).
- Context: the generation's frozen profile version (index plus a tool to read a part), settings, the opening's brief and fit check or the focus, communication rules with public names, the coverage review, the lines' traces. A selected passage or a finding (“Talk to the agent”) arrives as an attachment.
- Charged per message like the profile agent.

Acceptance:

- [ ] Selecting a passage of the resume opens the agent with it, and the agent answers about it with the profile in view.

### D3: Suggestions in the document

- A document change (a part, the lines it replaces, the lines it writes, the profile passages it draws on) shown in place with the word-level diff; Accept creates a snapshot authored by the AI and accepted by the user, Reject drops it; a newer one on the same lines supersedes the waiting one. Every change the agent makes is a suggestion, including one the user asked for; it can replace, remove or add lines.
- The agent grounds a suggestion on the profile version and on the user's words in the conversation; code refuses a figure found in neither (the profile agent's rule). A locked fact (the header, a position's employer, title and context) it suggests changing only on the user's request, which code checks against their messages.
- The user edits everything except the section titles; a reworded line keeps its trace (origin `edited`).

Acceptance:

- [x] Only accepted suggestions reach the document, each as a snapshot.
- [x] Asked to, the agent writes a fact the user just told it, and refuses a figure nobody gave.
- [x] The agent's change to a locked fact is refused unless the user asked for it in this conversation.

### D4: Pointing out what the profile doesn't back

- Lines that don't trace to the profile version (typed by the user or accepted from the agent) are findings, “not in your profile”, with Add to the profile (a suggestion in the profile's draft, origin `document`) and Ignore; figures not `[medido]`, never-include terms and originals with a public name too. None of them blocks: the PDF asks for “Generate PDF anyway”.
- “Profile version N is newer than this document's” with Use version N: the document freezes the newer version; traces and findings rerun against it.

Acceptance:

- [x] A line the user types that the profile doesn't back is pointed out, and Add to the profile creates a profile suggestion; after publishing and Use version N, it is no longer pointed out.

## Opening page

The opening page restructured after a product design review ([docs/design/opening-page-review.md](./design/opening-page-review.md)) and the owner's revision of it (workspace spec, “The opening page”). Owner decisions: no opening agent (ADR 0010 withdrawn; one agent per document, both receiving what the user answered and chose for the opening); the opening is one screen with three columns (Application, description, Fit); the resume and the cover letter are full-screen pages without the application controls.

### O1: The opening on one screen, the documents on their own pages

- Header: title and company, chips, `⋯` menu (Close or Reopen, Never recommend), one primary action per state and the switch **Opening · Resume · Cover letter**; on the document pages a slim header (“← Company · Title” and the switch).
- Opening page: Application (full tracker summary, details, timeline and giving up collapsed) · the description with warning signs marked · Fit (band, Check again, preference conflicts, requirement cards with each gap question inside its card). The Context block is gone: the application instructions show in the left column of the resume and cover letter pages.
- Resume and Cover letter: full-screen document workspace (index, findings and instructions on the left, document in the center, agent, preview and versions on the right), with their empty states and actions.
- Both document agents receive what the user answered and chose for the opening: gap answers (have or lack, text, linked positions and projects), application instructions, and for the letter the chosen story, the motivation points kept and the approved company facts.
- Below about 1280 px the Application column is a sheet behind a header button and Fit goes below the description; below `lg` everything stacks.

### O2: The Applications page, list and kanban

- One Applications page with two views. **List**: filters (status, type, company, sent or not) and sorting. **Kanban**: a column per application status; dragging a card to another column changes its status (the same rules as the status select: “Applied” asks what was sent, “No response” only comes with time). A card opens the opening page.
- Replaces the Tracker page's list; shares the tracker's queries and components.
- Status: built (filters, sorting, kanban with native drag and drop and a status menu per card). The resume score column is not shown yet. Replaced by the Openings page (V1–V4).

### O3: Mobile polish

- The opening page and the document pages on a phone: sticky primary action, the Application and Fit blocks reachable in a tap, the document workspace in read mode with tap to edit, and the preview as a sheet.
- Status: built (bottom bar with Fit, Application and the state's next step; read mode with Edit and Done; Index, Agent, Preview and Versions as sheets). Not yet checked on a real device.

## Openings page

The Applications page becomes **Openings** (`/app/openings`), with every analyzed opening, three tabs (Tracking, Calendar, Settings), a filter shared by Tracking and Calendar, and server-side pages (tracker spec, “The Openings page”; ADRs 0013 and 0014). Owner decisions: every opening listed, closed ones too, with Analyzed and Closed columns on the kanban; the default filter State is open; the metrics collapsible at the top of Tracking, ignoring the filter; the reminders in the layout above the tabs; the application type removed (the resume's origin replaces it); the calendar only shows, one month per request; the sidebar keeps three openings per status. No redirect from `/app/tracker`.

### V1: The Openings page and its tabs

- **Openings** in the sidebar (`/app/openings`), replacing Applications; `/app/tracker` is removed. A layout (route group, so the opening page stays outside it) with the title, the active reminders and the tabs Tracking · Calendar · Settings as links.
- Tracking keeps today's list and kanban, the kanban at full width; Settings holds the reminder settings; Calendar is a placeholder until V3.
- Status: built. Not yet checked in the browser.

Acceptance:

- [ ] The three tabs open at their routes, the reminders show on each, and the opening page has no tabs.

### V2: All openings, the shared filter and pages from the server

- The application type leaves the schema, the API and the UI (generated migration).
- `tracker.board` (in the tracker, which alone reads the timeline and its free text): openings with their board status, paged by a keyset cursor (ADR 0013), filtered on the server by status, state, company, source, fit, sent, resume origin and free text, sorted by last activity, sent date, company or status; encrypted fields decrypted only when the filter or sort needs them (ADR 0014). An optional status serves one kanban column.
- The filter bar with chips (field, is / is not, values), the default State is open, the non-default notice with Restore default and the count; the filter in the URL.
- The list in pages as the page scrolls; the kanban with Analyzed and Closed columns, each column paging inside itself with its total in the header, and the drag rules (out of Analyzed creates the application, Analyzed onto Closed closes the opening), moved at once and rolled back on failure.
- The metrics in a collapsible block at the top of Tracking.
- Status: built (migration `0033_drop_application_type`). The server side is covered by `board-service.test.ts` (statuses, keyset pages per sort, company and text in memory, fit, source, sent and resume filters); the drag rules by `planBoardMove`. Not yet checked in the browser.

Acceptance:

- [ ] An analyzed opening shows in the Analyzed column; dragging it to In preparation creates its application and it stays there after a reload.
- [ ] Filtering by company finds an opening by part of its name, and the list loads its next page as it scrolls.
- [ ] Removing the default chip shows the closed openings and the notice; Restore default brings it back.

### V3: The calendar

- `tracker.calendar`: one month (`month`, the viewer's `timeZone`, `show`), the filter's openings, their milestones grouped per opening and day, projections from the reminder settings; milestone logic in pure functions.
- The month grid with previous, today and next, the marker with “+N” and its popover, the two modes, the list by day on a phone.
- Status: built (`tracker/calendar.ts`, tested in `calendar.test.ts` and `board-service.test.ts`; the week starts on Sunday). Not yet checked in the browser.

Acceptance:

- [ ] An opening added and applied on the same day shows one “Applied” marker with “+1”, whose popover lists both.
- [ ] In Latest or next, an application with an interview note dated next week shows only that note.

### V4: The sidebar's three per status

- Each sidebar group lists its three latest openings and “See more (N)”, opening `/app/openings` filtered by that status; the groups of openings being analyzed, failed or refused stay complete.
- Status: built (an open group's link adds State is open, so it lists what the group counts). Not yet checked in the browser.

Acceptance:

- [ ] With five applied openings, the group shows three and “See more (5)” opens the list filtered by Applied, with the non-default notice.

### V5: Analysis is optional; no external applications

Owner decisions: an opening is always added on New opening, analyzed now or later; there is no separate external application. Without credits the analysis is unavailable and the user names the company and title.

- New opening gains “Analyze now” (on by default, off and unavailable without credits for a fit check); off, it asks for the company and title, keeps the text or link optional and registers the opening as `unanalyzed` (the old `external` status, renamed by a generated migration), with no credits spent.
- The opening page of an unanalyzed opening shows the application block (Mark as applied) and “Analyze this opening” once it has a description or link; the analysis keeps the user's company and title. Closing and reopening it keeps it unanalyzed.
- The board, its filter, the kanban and the sidebar gain Not analyzed, before Analyzed, with the same drag rules.
- Removed: “Applied elsewhere” and its dialog, `tracker.createExternal`, `applications.external` (generated migration) and the rule that let an external application be set to Applied from any status, the “Elsewhere” badge, the glossary's External application.

Acceptance:

- [ ] With no credits, New opening registers an opening from a company and title; it shows under Not analyzed and can be marked as applied.
- [ ] Analyzing it later keeps the typed company and title.

## LinkedIn page

The LinkedIn text moves out of the library to its own sidebar item, the second one, and gains the sections LinkedIn asks for (resume spec, “LinkedIn”). Owner decisions: generated at once and redone by parts; the headline as AI options to choose from; education, certifications and languages printed by code (languages on LinkedIn's scale), the education's description by the AI only when the profile backs it; the page edits like My career, in the document workspace.

### L1: The LinkedIn page and its sections

- **LinkedIn** in the sidebar after My career (`/app/linkedin`); the library stops listing the LinkedIn document and its old address opens the new page.
- Content gains `headline` (the chosen line) and `headlineOptions`, `education` (credential entries with an optional `description` line), `certifications` and `languages` (credential entries with LinkedIn's `proficiency`, or none when the level can't be read). A text written before has none of them; no migration (snapshots are JSON).
- The writer returns the headline options and the education descriptions besides the About, experiences and projects; code checks each like the summary (a line citing profile lines, figures only `[medido]`, communication rules), drops an option over 220 characters, prints the credentials and converts the language levels.
- The LinkedIn view as a resume (`linkedinAsResume`) carries the chosen headline, the education descriptions and the credential sections, so the code checks, the coverage review and the copy gate cover them with no rules of their own.
- The page: the empty state with Generate my LinkedIn, then the document workspace (index, findings, the texts in blocks, choosing a headline, Copy text per section, versions on the right).

Acceptance:

- [x] LinkedIn is the sidebar's second item; generating writes headline options, About, experiences, projects, education, certifications and languages; each section copies its text.
- [x] A language level reads on LinkedIn's scale in the output language; a headline option the profile doesn't back is not kept.

### L2: Redoing one section

- **Generate this section again** on the headline, the About, an experience, a project and an education's description: a `linkedin_section` generation naming the section, charged as an adjustment (`generate_document` with the section hint, 10 × level), whose snapshot replaces that section only; the code checks run on it.

Acceptance:

- [x] Redoing one experience leaves the other sections, and the user's edits in them, untouched, in a new snapshot that undo reverts.

### L3: The agent on the LinkedIn text

- The document agent and its suggestions on the LinkedIn text, through its view as a resume: a change is located and applied on that view and mapped back; Talk about this and Talk to the agent from a finding work as on a resume.

Acceptance:

- [x] Asked to rewrite a bullet of an experience, the agent suggests it in place and Accept creates a snapshot.

## LinkedIn step by step

Creating the LinkedIn text becomes a guided flow, one step per section, with questions about what the profile lacks before each one is written (resume spec, “LinkedIn”, “Step by step, with questions”). Owner decisions: one step per section; the answers count at once as LinkedIn instructions and are offered to the profile as suggestions; priced like the cover letter's interview (per question and per step), with Generate everything at once kept as a shortcut.

### L4: The steps, without questions

- Starting (the Goal step) creates the LinkedIn document with a snapshot of what code prints (experiences and projects with no bullets, education, certifications, languages), free.
- A step writes its section with a `linkedin_section` generation; new section keys for every experience (`experiences`) and every project (`projects`) at once, besides the existing ones; priced as an adjustment.
- The page: the steps on the left while guided (Goal, Headline, About, Experiences, Projects, Education, Certifications and languages; the empty ones skipped), the text in the editor, Next and Write again per step; Finish runs the coverage review. Generate everything at once stays on the Goal step.
- Generate this section again opens that section's step alone.

Acceptance:

- [x] Going through the steps without questions writes each section in its own snapshot, the other sections and the user's edits untouched, and Finish leaves a coverage review.
- [x] Generate this section again on an experience opens the Experiences step for that position and rewrites only it.

### L5: Questions in each step

- A LinkedIn interview per step (turns like the motivation interview's, a `linkedin_turn` task priced like `motivation_turn`), up to three questions, by voice or text, skippable; none when the profile already holds what the section needs.
- The answers split into points tied to a position, project or education, kept with the LinkedIn document as LinkedIn instructions; the LinkedIn writer and its checks read them as `instructions` (cited like profile lines, figures as the user wrote them), and the step lists them, removable.

Acceptance:

- [x] An answer giving a result's figure lets the Experiences step write a bullet with that figure, citing the instruction, with no figure finding.
- [x] Skipping the questions writes the section from the profile alone, charging only the step.

### L6: Answers to the profile

- Each point is offered, one by one, as a suggestion in the profile's draft (origin `linkedin`): a position's Responsibilities or Results, a project's What I did, or the career direction; the step says it was sent, with a link to My career.

Acceptance:

- [x] A point sent to the profile appears as a pending suggestion; after accepting and publishing, a new resume can use it.
