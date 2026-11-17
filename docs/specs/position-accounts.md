# StoryToRole spec: Position accounts

Accepted Nov 16, 2026. Amends [guided-interview.md](./guided-interview.md) (extraction, approval, data model) and [resume-and-cover-letter.md](./resume-and-cover-letter.md) (what generation reads); see [ADR 0008](../adr/0008-position-account-is-the-source-of-truth.md).

## Goal

Each position has an **account**: the user's own text about what they did there, like a section of a `profile_truth.md`. It is versioned and approved as a whole, and it is what every document is generated from. The AI interviews the user to make the account richer; it never decides that an account is right or wrong.

## The account

- One per position (and per credential with a story to tell), in the career language, written in the user's voice.
- **Versions.** Every change is a new version: the user's own edit, a version the interviewer proposes, or the first draft from an import. Only an approved version is used by generation; earlier versions stay readable and restorable.
- **Form.** Free text the user writes as they like (prose, bullets, sections), like their `profile_truth.md`. There is no fixed shape; the interviewer guides by what is still missing, aiming for an account that tells:
  - what it was like to work there (the company, its product and size, the team, who they reported to);
  - what they did, in their own actions, and with whom ("I led", "I took part in", "I supported");
  - the challenges, how they handled them and what came of it;
  - **what they did not do** in that position, plainly (the meu-emprego-novo method's protection against exaggeration). Generation never claims it, and the fit check reads it as a declared gap.
- **Highlighter marks.** As in the meu-emprego-novo method, a figure carries where it comes from, in brackets, shown in the space as a highlighter over the text:
  - `[medido]` (measured): there is a report, dashboard or document behind it; used as written.
  - `[estimado]` (estimated): the user has a good sense of it, without proof; used only with a qualifier ("about", "cerca de").
  - `[sem número]` (no number): a qualitative result, kept as such.
  - `[a confirmar]` (to confirm): something the user or the interviewer left open; never used until resolved.
  A figure without a mark is highlighted too, and the interviewer asks where it comes from. The marks are part of the account's text; code reads them and generated documents never show them. The extraction of today keeps a note like `[medido]` in the quote and out of the fact; here it is the rule.
- **Confidentiality, per account.** Each account has its own "do not include" list, managed in its space: names, clients, codenames and figures that must never appear in what is generated from it, flagged from the text or added by hand (a truth file's rules for that position land here). Code applies them to everything generated from that account, as it applies sensitive items today; the general "Names and figures" review remains for what spans positions.

## The position's space

Clicking a position opens its space beside the chat, one page:

1. **The account**, approved version, editable in place (an edit is a new version to approve), its highlighter marks shown over the text.
2. **What the interviewer understood**: a short reading of the account that confirms it was understood, and **what would make it richer**, as concrete prompts ("the migration has no result yet: what changed after it?", "no team size", "which tools did you use day to day?"). Each prompt starts a message to the interviewer.
3. **Proposed version**, when the interviewer has one: shown as a diff against the approved account; approve, edit or discard.
4. **Skills** extracted from the approved account, and its **do not include** list.
5. **The conversation** with the position's interviewer, including what the general chat relayed to it, and a box to talk to it directly.

## The interviewer

- It reads the approved account and the conversation, asks one question at a time about what the account lacks (what it was like there, the user's own actions, challenges, results, what they did not do, where each figure comes from), following the existing behaviour rules: no leading questions, no suggested results or numbers, the user is the subject, partners credited, an old resume is a lead to confirm, not a fact.
- For every figure the user gives, it asks where it comes from and marks it (`[medido]`, `[estimado]`, `[sem número]`); one the user doesn't remember becomes `[sem número]` and the interview moves on.
- After a few answers, or when the user asks, it proposes a new version of the account that folds in only what the user said: nothing added, every new figure quoted from the user's words, checked in code.
- What happens in a position's space reaches the general chat as today.

## The general chat as a gateway

The general chat is where the user can tell anything, in any order; it does not process their words a second time.

1. **Routing.** A small, fast model reads only the message and the timeline (titles, employers, dates) and picks where it goes: the position being talked about (a follow-up stays with the same one), a new position to propose, or a question about the career. The orchestrator no longer writes the reply.
2. **Forwarding.** The message goes verbatim to that position's interviewer, whose reply streams straight to the user, marked with the position it comes from. The user can tell a whole position's account in one message.
3. **Another position mentioned.** The interviewer handles what belongs to its position and hands back the passages about another one (a `hand_off` tool: position, passage). Each passage is first checked against that position's fact index and its pending notes (vector similarity, then a small model only when close): what the account or a note already holds creates nothing, and the chat says so ("Already in Globex's account: the billing system served 2 million customers"). Anything new becomes a **pending note** on that position, verbatim, and the chat tells the user where it went ("Noted on Globex: …").
4. **Questions about the career** ("where did I work with React?") are answered by a small model from the fact indexes of the approved accounts, each answer naming the positions and passages it rests on; no interviewer is called.

## Pending notes

- A position with pending notes shows it on its card and in its space ("2 new facts to bring into the account").
- In the space, the interviewer proposes a new version that brings the notes in, and checks the proposal against each note: covered, or not and why (a figure without its origin, a detail that contradicts the account). Notes left uncovered stay pending; the user can also dismiss one.
- Approving the version clears the notes it covers.

## Imports

- A resume, LinkedIn PDF or truth file proposes a draft version of a position's account only when it says something that account doesn't: a new fact, a figure, a tool, a project. The draft folds the new passages into the account, without repeating what it already says. A file that only restates what the account holds leaves it as it is: no new version.
- A position the file brings for the first time gets a first draft account built from the file's passages.
- Conflicting locked facts (title, dates) are still picked side by side.
- A draft is approved as a version, like any other; the "approve imported positions" shortcut approves the drafts as they are.

## Generation

- The fit check compares the opening's requirements with the skills index and the accounts' relevant passages (retrieved by vector similarity, as evidence is today).
- A resume or cover letter is written from the approved accounts of the positions it includes. Bullets are written for the document's focus: the opening's requirements, a library document's focus ("React Native", "General"), or the strongest points of each position for a general resume.
- Each generated line keeps a trace to the passages of the account versions it rests on. Code rejects a line with a figure no account states, a `[medido]`-less figure used without its qualifier, anything marked `[a confirmar]`, anything on the account's "do not include" list, and anything the account says the user did not do.

## The fact index

Behind each account, StoryToRole keeps an index of what it states (skills, achievements, figures with their mark, tools, what the user did not do), each entry pointing to its passage. It is rebuilt whenever a new version is approved (never for a draft), in a task the user did not ask for, so it takes no credit (their own key when they use one, otherwise StoryToRole's). The user never edits it: to change it, they change the account. The fit check, library search and traces read it; generation reads the accounts themselves.

## What changes from today

| Today | With accounts |
|---|---|
| Facts approved one by one (`draft_facts` → `evidence`) | An account version approved as a whole |
| Repeated facts folded across files | The import merges into the position's account |
| Stories (problem, action, result) as records | Told inside the account; the interviewer asks for them |
| Skills linked to evidence | Skills and the fact index rebuilt from each approved version |
| A note like `[medido]` stripped from facts | Highlighter marks that decide how each figure may be used |
| Sensitive items for the whole career | A "do not include" list per account (plus the career-wide review) |
| Resume lines built from evidence | Lines written from accounts for the document's focus |
| Depth by counts of evidence | What the interviewer says would make the account richer |

## Migration

Each existing position gets a first draft account written from its approved evidence, stories and the user's own words in its sessions, for the user to approve; until they do, generation keeps using its evidence. Credentials keep their locked facts; one with stories gets an account the same way.

## Acceptance criteria

- [ ] A position's space shows its approved account, editable, with its versions.
- [ ] The interviewer proposes a richer version from the conversation; the user approves, edits or discards it, shown as a diff.
- [ ] A proposed version adds nothing the user did not say, and every new figure appears in the user's words.
- [ ] Importing a file proposes a draft version only for positions where it brings something new, merged with the existing account; a file that only restates an account leaves it unchanged.
- [ ] The fact index (skills included) is rebuilt from each newly approved version, at no credit to the user.
- [ ] The interviewer asks what the user did not do, and the origin of each figure, marking it; unmarked figures are highlighted.
- [ ] Generation uses `[estimado]` figures only with a qualifier, never `[a confirmar]` ones, never what the user did not do, never what the account's "do not include" list holds.
- [ ] Resumes and cover letters are generated from accounts, with bullets chosen for the focus, each line traced to the account, and a line with an unstated figure rejected.
- [ ] Existing positions get a first draft account from their evidence and conversations.
- [ ] The general chat routes each message with a small model and forwards it verbatim to one interviewer, whose reply reaches the user without being rewritten.
- [ ] A passage about another position becomes a pending note there only when its account and notes don't already hold it; either way the user is told.
- [ ] A position with pending notes says so; the interviewer's proposal is checked against each note, and approving clears the ones it covers.
- [ ] A question about the career is answered from the fact indexes, naming the positions it rests on.
