# StoryToRole spec: Position accounts

Draft for the owner's review. Amends [guided-interview.md](./guided-interview.md) (extraction, approval, data model) and [resume-and-cover-letter.md](./resume-and-cover-letter.md) (what generation reads); see [ADR 0008](../adr/0008-position-account-is-the-source-of-truth.md).

## Goal

Each position has an **account**: the user's own text about what they did there, like a section of a `profile_truth.md`. It is versioned and approved as a whole, and it is what every document is generated from. The AI interviews the user to make the account richer; it never decides that an account is right or wrong.

## The account

- One per position (and per credential with a story to tell), in the career language, written in the user's voice.
- **Versions.** Every change is a new version: the user's own edit, a version the interviewer proposes, or the first draft from an import. Only an approved version is used by generation; earlier versions stay readable and restorable.
- **Form.** Free text the user can write as they like (prose, bullets, sections), like their `profile_truth.md`. *Open: should the interviewer keep one shape (for example context, what I did, results, tools) so accounts read alike?*
- **Confidentiality.** Names and figures the user wants hidden are flagged as sensitive items, as today, whether they come from a file's rules or the user marks them in the text; code applies them to everything generated. *Open: may an account carry its own "do not include" rules, as a truth file does?*

## The position's space

Clicking a position opens its space beside the chat, one page:

1. **The account**, approved version, editable in place (an edit is a new version to approve).
2. **What the interviewer understood**: a short reading of the account that confirms it was understood, and **what would make it richer**, as concrete prompts ("the migration has no result yet: what changed after it?", "no team size", "which tools did you use day to day?"). Each prompt starts a message to the interviewer.
3. **Proposed version**, when the interviewer has one: shown as a diff against the approved account; approve, edit or discard.
4. **Skills** extracted from the approved account.
5. **The conversation** with the position's interviewer, including what the general chat relayed to it, and a box to talk to it directly.

## The interviewer

- It reads the approved account and the conversation, asks one question at a time about what the account lacks (scale, the user's own actions, results, numbers, tools), following the existing script's stages and behaviour rules (no leading questions, the user is the subject, partners credited).
- After a few answers, or when the user asks, it proposes a new version of the account that folds in only what the user said: nothing added, every new figure quoted from the user's words, checked in code.
- The general chat keeps routing messages to the right position's interviewer; what happens in a position's space reaches the general chat as today.

## Imports

- A resume, LinkedIn PDF or truth file proposes a draft version of a position's account only when it says something that account doesn't: a new fact, a figure, a tool, a project. The draft folds the new passages into the account, without repeating what it already says. A file that only restates what the account holds leaves it as it is: no new version.
- A position the file brings for the first time gets a first draft account built from the file's passages.
- Conflicting locked facts (title, dates) are still picked side by side.
- A draft is approved as a version, like any other; the "approve imported positions" shortcut approves the drafts as they are.

## Generation

- The fit check compares the opening's requirements with the skills index and the accounts' relevant passages (retrieved by vector similarity, as evidence is today).
- A resume or cover letter is written from the approved accounts of the positions it includes. Bullets are written for the document's focus: the opening's requirements, a library document's focus ("React Native", "General"), or the strongest points of each position for a general resume.
- Each generated line keeps a trace to the passages of the account versions it rests on, and code rejects a line with a figure no account states.

## What changes from today

| Today | With accounts |
|---|---|
| Facts approved one by one (`draft_facts` → `evidence`) | An account version approved as a whole |
| Repeated facts folded across files | The import merges into the position's account |
| Stories (problem, action, result) as records | Told inside the account; the interviewer asks for them |
| Skills linked to evidence | Skills extracted from the approved account |
| Resume lines built from evidence | Lines written from accounts for the document's focus |
| Depth by counts of evidence | What the interviewer says would make the account richer |

## Migration

Each existing position gets a first draft account written from its approved evidence, stories and the user's own words in its sessions, for the user to approve; until they do, generation keeps using its evidence. Credentials keep their locked facts; one with stories gets an account the same way.

## Acceptance criteria

- [ ] A position's space shows its approved account, editable, with its versions.
- [ ] The interviewer proposes a richer version from the conversation; the user approves, edits or discards it, shown as a diff.
- [ ] A proposed version adds nothing the user did not say, and every new figure appears in the user's words.
- [ ] Importing a file proposes a draft version only for positions where it brings something new, merged with the existing account; a file that only restates an account leaves it unchanged.
- [ ] Skills are extracted from each newly approved version.
- [ ] Resumes and cover letters are generated from accounts, with bullets chosen for the focus, each line traced to the account, and a line with an unstated figure rejected.
- [ ] Existing positions get a first draft account from their evidence and conversations.

## Open questions

1. Free form or a shared shape for accounts (see "Form")?
2. May an account carry its own "do not include" rules (see "Confidentiality")?
3. Keep a hidden index of facts derived from each version (cheaper fit checks, finer traces), or extract only on demand?
