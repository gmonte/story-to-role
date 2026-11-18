# StoryToRole spec: The profile (profile_truth)

Nov 17, 2026 · @Guilherme

## Goal and scope

Each user keeps their whole career in one document, `profile_truth.md`, the master profile of the meu-emprego-novo method: the long, complete and true version of their career, from which every resume, cover letter and fit check is derived ([ADR 0008](../adr/0008-profile-truth-is-the-source-of-truth.md)). StoryToRole makes that document easy to write and keep right: a block editor that knows its format, a linter that points out what breaks it, an AI review of its quality, and an agent that interviews the user about any passage and proposes changes they accept or reject.

The method's parts in the MVP: principles (00), the master profile (01), screening (03), tailored resumes and their adjustment (04, 04b), the coverage review (05) and tracking (07). LinkedIn (09) follows right after; job search (02), interview prep (06), scams (08) and the retrospective (10) come later. Screening, generation, the coverage review and tracking are specified in [resume-and-cover-letter.md](./resume-and-cover-letter.md) and [tracker.md](./tracker.md); the shared AI platform in [ai-platform.md](./ai-platform.md).

## Principles

From the method's principles, applied to the product:

1. **One source of truth.** Every document is derived from the published profile. A fact changes in the profile, never in each document.
2. **Never invent.** The AI may reorder, summarize, emphasize and translate; it may not add a technology, title, number or certification the profile doesn't state. What a document needs and the profile doesn't show is a declared gap.
3. **The user approves.** Nothing the AI proposes reaches the profile without the user accepting it; nothing is sent in the user's name.
4. **Hard rules for what goes wrong.** Communication rules and job preferences are written down and applied in code, not left to a prompt.
5. **Privacy by default.** The profile is encrypted with the user's key; only the passages a call needs reach the AI provider.

## The document

The profile follows the method's template. Section names are recognized in English and Brazilian Portuguese; a new profile starts from the template in the interface language, each section with a short hint of what to write.

| Section | What it holds |
|---|---|
| Professional identity | How the user defines themselves, seniority, areas, career direction (what they look for next) |
| Contact | Only what may appear on a resume; generation takes contact data from nowhere else |
| Experience (most recent first) | One subsection per position, titled `### Company — Title (YYYY-MM to YYYY-MM)` (`present` for the current one), with context (sector, team size, product), responsibilities, tools, results (each figure marked), and what the user did **not** do in that position |
| Projects (optional) | Personal or side work that is not a position (a solo product not yet launched, an open-source library), so a resume never reads it as the current job. Always right after Experience. One subsection per project, titled `### Name (YYYY-MM to YYYY-MM)` (`present` while ongoing; no employer or title), with an optional role line (`Role: Founder` / `Papel: Founder`), the experience's fields where they fit (context: what it is and for whom; what I did; tools; results, each figure marked; what the user did **not** do, optional) and an optional `Link:` line. Recognized as "Projetos", "Projetos pessoais", "Projects", "Side projects". The linter never demands the section; the insert menu creates it, and existing profiles don't get it automatically |
| Education | `Course — Institution — status (completed / in progress until YYYY-MM)` |
| Certifications | `Name — issuer — date — status (valid / expired in YYYY-MM / renewing)` |
| Competencies | Four lists: master, use often, occasional experience (professional use, only now and then), studied without professional experience |
| Languages | `Language — real level` |
| Known gaps | What the user does not have or has not done, stated plainly |
| Communication rules | "Never include", "never claim", an optional "Public names" line (`- Public names: Projeto Fênix → plataforma de pagamentos; Banco X → banco de varejo`: `→`, `->` or `=>`, entries split on `;`) and the optional **translations dictionary**: one line per output language, written in the profile's language (`- Em inglês:` in a Portuguese profile, `- In Portuguese:` in an English one; both directions work), whose entries, as sub-items or `;`-separated on the line, say how a document in that language prints a field code copies from the profile: `Meta IT (agora Insi) → Meta IT (now Insi)`, `Bacharelado em Sistemas de Informação → Bachelor's in Information Systems`, `Belo Horizonte, MG, Brasil → Belo Horizonte, MG, Brazil`. An entry matches a whole field, case aside, and changes wording only: never a figure or a fact. The rules govern only the public documents (resume, cover letter, LinkedIn text and their adjustments), never the profile itself, which accepts everything and stays in its own language. A "never include" item is a literal term (a name, client, codename or figure: it has an uppercase letter or a digit, or is written in quotes) that code filters out of prompts and outputs of public documents, or a category (any other item, such as "dados bancários"), an instruction handed to the writer that code never matches as words. Items split on commas and semicolons only |

**Addenda.** The method's optional last section (details remembered later) is not part of the template and not read: a detail goes in its proper section. A document that has it (an older profile, an import) still parses; the linter flags each item under it ("Move this to its section"), and nothing deletes the section automatically.

**Figure marks.** Every figure in a result says where it comes from, as the method asks:

| Mark | Meaning | In generated documents |
|---|---|---|
| `[medido]` | A report, dashboard or document backs it | Used as written |
| `[estimado]` | The user has a good sense of it, without proof | Never used |
| `[sem número]` | A qualitative result | Used as a qualitative result |
| `[a confirmar]` | Left open (a figure from an old resume, a detail to check) | Never used until resolved |

English aliases (`[measured]`, `[estimated]`, `[no number]`, `[to confirm]`) are read the same way. The marks stay in the profile and never appear in a generated document.

## The editor

My career is the editor: the document's index on the left (its sections and positions), the document in the middle, the agent on the right.

- **Blocks, Markdown underneath.** A Notion-style block editor (TipTap/ProseMirror): each heading, paragraph and list item is a block, with a "+" and a drag handle in the margin and `/` opening the insert menu. What is stored is the Markdown of `profile_truth.md`, so the file the user downloads is the method's file. A small prototype in slice P1 confirms the Markdown round trip before the editor is built on it.
- **Insert menu.** Experience, project, education, certification, language, competency, gap, or communication rule: each lands in its section, in the right order (positions and projects by date), already in the template's format with grey hints. Dates and a certification's status have pickers that write the text. A project asks for its name, an optional role and its dates, and creates the Projects section (right after Experience) when the profile lacks it.
- **Moving an entry.** Only when asked ("move X to Projects", "make X an experience"), the agent proposes the move as two suggestions that go together (the removal of the whole entry, and its addition in the other format, keeping every field and figure mark; a position's title becomes the project's role); the user accepts both. An addition to a section the profile lacks creates the section in its place.
- **Autosave and undo.** Every change is saved to the draft as the user types; undo and redo work across the session.
- **Selection.** Selecting text shows a floating bar whose AI icon sends the passage to the agent.

### The linter

A deterministic check, plain code, runs on every edit in the browser and again on the server when the draft is saved. **Ignore.** A content finding that doesn't apply (a competency that isn't one, overlapping dates of parallel jobs) can be ignored from its hover card or the findings list: it leaves the list, the count and the underlines, and waits under a collapsed "Ignored (n)" group with "Restore". It is stored on the draft by a key (the first 16 hex characters of the SHA-256 of the finding's code, its line's text and its params), so editing the line brings the finding back. Format findings block publishing and can't be ignored. The agent only ever gets non-ignored findings.

Each finding is underlined in the text, with a message and, where it applies, "Fix format" or "Talk about this".

- **Format:** required sections present and in order (Projects, when present, right after Experience); each experience title parseable (company, title, dates) and each project title parseable (name, dates); dates as `YYYY-MM` (a year alone is accepted for when a course was completed or a certification issued); education and certification lines in their format, certifications with a status; competencies under one of the three levels.
- **Content rules:** a figure without a mark in an experience's or a project's results; a mark written another way than the canonical one; an experience without "what I did not do"; overlapping or out-of-order dates; an expired certification without its date; a tool named in an experience or a project but missing from Competencies, a competency listed with no experience or project behind it and not under "studied", or a "studied" competency an experience or a project uses; a public names entry or a translations dictionary entry missing one of its sides (never blocks publishing); an item under Addenda, which is not read.

**Fix format**, on demand per finding or for the whole document, rewrites what code can fix with certainty: an experience title into `### Company — Title (YYYY-MM to YYYY-MM)` (a project title into `### Name (YYYY-MM to YYYY-MM)`) when its parts are recognizable ("Jan/2021 - present" becomes "2021-01 to present"), dates into `YYYY-MM`, marks written another way (`[Medido]`, `(medido)`, `[measured]`) into the canonical one, missing required sections inserted with their hints, sections reordered, a certification's missing status added as a blank to fill. Its changes go to the draft and can be undone; what it can't fix stays marked.

### Validate and publish

One button with two steps:

1. **Validate** sends what changed since the last published version (each changed section, with the index for context) to an AI quality review, charged to the user's credits with the estimate shown first. It reports, each finding on its passage with "Talk about this": a result with no clear impact, the user's own work mixed with the team's, the same achievement with different figures in two places, a figure with no origin, an empty "what I did not do", what is still unknown about a position. It also proposes each competency's level from the experiences, as suggestions. Findings never block.
2. **Publish** makes the draft the official, numbered version. The user may publish after validating, after fixing what the validation found, or without validating at all. Lint **format** errors block publishing, since the rest of the product needs to read the document; content findings never do.

Every published version is kept, readable, comparable with any other and restorable into the draft. Only a published version feeds screening and generation, and each generated document freezes the version it used.

## The agent

One agent per user, on the chat transport of [ADR 0007](../adr/0007-profile-agent-on-chat-agent.md), in the panel beside the document.

- **Talking about a passage.** A selected passage, or a finding's "Talk about this", reaches the chat as a quote. Without a quote the agent works on the document as a whole and says in which section things belong.
- **Context.** Each turn carries the quoted passage, its section, the document's index (section and position titles), the known gaps and the communication rules, never the whole document; a tool reads another section when the agent needs it.
- **Interviewing.** It follows the method's interview prompt: one employer at a time; what problem the user solved, how, with what, with what result, and what was theirs and what was the team's; where each figure comes from, marking it; what the user did **not** do. At most three questions per message; it never suggests results or numbers; an old resume is a lead to confirm with the user, not a fact; what the user doesn't remember becomes `[sem número]` and the interview moves on.
- **Suggestions.** The agent changes nothing directly. A tool proposes a change (the passage, the new text, why), shown in the document as a tracked change to accept or reject, one by one or all at once; accepted changes go to the draft.
- **"Interview me".** For a user who doesn't know where to start, the agent interviews position by position from scratch, filling the template through suggestions.
- **Translations.** The agent knows the translations dictionary. Asked to translate part of the profile for its documents ("translate my education to English"), it proposes the entries as suggestions on that language's line, one per field exactly as the profile writes it; the profile itself stays in its language.
- **Cost.** Each message is charged as a chat message (or runs on the user's key).

## Importing a resume

A resume, LinkedIn PDF or truth file (PDF, DOCX, Markdown or text, with the existing size and page limits) is read by code and checked to be a career document.

- **Empty profile:** the AI writes the first draft in the template's format from the file. It arrives as suggestions like everything else, accepted all at once with one click, so nothing is written without the user and nothing they typed meanwhile is overwritten.
- **Existing profile:** the AI compares the file with the draft and proposes only what it lacks (a position, a project, a tool, a result), as suggestions in the right sections. What the profile already says creates nothing, and neither does what a suggestion still waiting already writes: a second file about the same position completes that suggestion instead of repeating it (a resume and a LinkedIn export uploaded together make one first draft).
- **Figures from a resume arrive as `[a confirmar]`**: an old resume may carry figures with no backing. They stay out of every generated document until the user says where they come from. Code enforces it: a result with a figure and no mark (or marked as having no number) gets the open mark, a "measured" or "estimated" mark the file doesn't write next to that figure becomes the open one, and a line whose figure the user already marked is never rewritten by an import.
- **Every change rests on the file**: it carries a passage of the file, checked by code, and its numbers must be in the file.
- **Disagreements** with the profile (another date, another title) arrive as a suggested replacement with both versions side by side.
- **A truth file's "do not include" rules** arrive as suggestions for Communication rules.
- When it ends, the agent sums up in the chat what was proposed and what is still missing (said once, at no cost). Everything lands in the draft once accepted and counts once published. The import starts when the file is uploaded and is charged per file, with the cap shown beside the upload; a file that couldn't be imported (no credits, a failure) stays in Sources with an "Import into the profile" button, and one refused for what it is (not about a career, unreadable, too long) costs nothing.

## Job preferences

A separate document in the same editor, with its own template and linter: work model (remote, hybrid, on site), accepted locations, salary range, excluded companies and sectors, and the discard rules the user writes down ("contact only through a messaging app"). A company can be excluded from an opening or the tracker, which adds it here. Only screening reads this document; generation never does, so a salary or an excluded company never reaches a resume prompt. It is versioned like the profile, without validation.

## Data model

Every table belongs to the user and is encrypted with their key where it holds career text.

| Table | Key fields | Notes |
|---|---|---|
| `profile_documents` | user id, kind (profile, preferences), draft Markdown, draft updated at, published version id | One row per user and kind |
| `profile_versions` | document id, number, Markdown, published at, validated at | Immutable once published |
| `profile_extracts` | version id, experiences (employer, title, start, end), credentials, competencies by level, languages, gaps, communication rules, figures with their mark and passage | What the linter extracts from a published version; what the rest of the product reads |
| `profile_passages` | version id, section, position, kind (evidence, studied, gap, not done, rule), text, embedding | Passages of a published version, embedded locally (ADR 0004); screening retrieves only evidence |
| `profile_suggestions` | document id, anchor (passage), proposed text, reason, origin (agent, import, validation, application), status | Pending until accepted or rejected |
| `profile_validations` | document id, base version, findings | The last validation's report |
| agent chats and messages | as in ADR 0007 | Transcript encrypted, purged after 7 days |

## Acceptance criteria

- [ ] A new profile starts from the template with hints; the insert menu adds each section type in place and format.
- [ ] The linter marks format and content findings in the text as the user types; "Fix format" corrects what it can and leaves the rest marked.
- [ ] The draft autosaves and supports undo; Validate reviews only what changed and is charged; Publish creates a numbered version; format errors block publishing and quality findings don't.
- [ ] Published versions can be read, compared and restored.
- [ ] Selecting a passage or a finding opens the agent with it; the agent interviews per the method (three questions at most, no suggested numbers) and proposes tracked changes the user accepts or rejects.
- [ ] Uploading a resume proposes only what the profile lacks, with its figures as `[a confirmar]` and disagreements side by side.
- [ ] Competency levels are suggested and confirmed; "studied" competencies have no experience behind them.
- [ ] Job preferences live in their own document, read only by screening.
- [ ] The downloaded file is the method's `profile_truth.md`.
