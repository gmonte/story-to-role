# StoryToRole spec: Resume and cover letter generation

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal and scope

For one opening, StoryToRole generates a tailored resume and cover letter using only the approved evidence base (see [guided-interview.md](./guided-interview.md)). Generating the first resume for an opening starts an application.

Hiring interview prep is out of the MVP.

## Output language

- The user picks the output language before generating. It is preselected from the language detected in the opening description.
- After generating, the user can ask for the documents in another output language at any time, which creates a new language version. Every snapshot is kept.

## Adaptations

A snapshot in another output language is an **adaptation** of an existing snapshot, not a literal translation and not a fresh generation.

- It keeps the same evidence selection and the same evidence trace for every line.
- It rewrites wording for a native reader of that language and market: idiomatic action verbs, section names, date and number formats, and the opening's keywords in that language. Phrasing that does not work in the target language is reworked rather than translated word for word.
- It adds no new fact and never converts figures (no currency conversion, which would invent an exchange rate).
- The same code checks as any generation apply: locked facts and forbidden terms.
- Generating again from the evidence in the new language remains available as a separate action.

## Language versions and snapshots

Documents are versioned like a git history, stored as rows in Postgres rather than in a git repository. In git terms, a language version is a branch and a snapshot is a commit.

- An application has one **language version** per output language the user chose to create; the user decides which languages exist. Each language version holds that language's resume and cover letter.
- Every change to a document creates an immutable **snapshot**: a full copy of the structured content, its parent snapshot, its origin (generated, adapted, edited), its author (user or AI) and its time. Diffs between any two snapshots are computed when shown.
- The **latest snapshot of each language version is the official one**. There is no manual "current" marker; the history exists so actions can be undone. Restoring an old snapshot creates a new latest snapshot with that content; history is never rewritten.
- An adaptation takes the latest snapshot of one language version as its base and writes the result either into a new language version or into an existing one. Into an existing language version it **recreates** it: the result becomes its new latest snapshot, replacing its content (edits made only in that language version are not carried over). Earlier snapshots stay in history, so recreating can be undone. Example: after many edits in English, the user recreates the Portuguese language version from the English one.

## Submission freeze

- When the user marks an application as applied, they say which language versions were sent; more than one can be sent.
- From then on every document of the application, in every language version, is read-only: no new snapshots, no syncs, no archiving or deleting of snapshots.

## Rendering

PDF and DOCX files are rendered on demand from a snapshot's structured content. Since snapshots are immutable, a rendered file never goes stale: it may be cached in private Vercel Blob storage keyed by snapshot and template, and the cache can be purged at any time without losing anything.

## Open points

- Language sync between language versions (merging changes from one language into another) and how granular it is.
- Archiving and deleting snapshots and language versions.
- Whether an application may hold two language versions in the same language.
- Undoing a submission marked by mistake; reusing a frozen application as a starting point; deletion rights over frozen documents.
- Which output languages are offered.
- How locked facts such as job titles appear in another language.
