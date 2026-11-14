# StoryToRole spec: Resume and cover letter generation

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal and scope

For one opening, StoryToRole generates a tailored resume and cover letter using only the approved evidence base (see [guided-interview.md](./guided-interview.md)). Generating the first resume for an opening starts an application.

Hiring interview prep is out of the MVP.

## Output language

- The user picks the output language before generating. It is preselected from the language detected in the opening description.
- After generating, the user can ask for the same document in another output language at any time. Every version is kept.

## Adaptations

A new version in another output language is an **adaptation** of an existing version, not a literal translation and not a fresh generation.

- It keeps the same evidence selection and the same evidence trace for every line.
- It rewrites wording for a native reader of that language and market: idiomatic action verbs, section names, date and number formats, and the opening's keywords in that language. Phrasing that does not work in the target language is reworked rather than translated word for word.
- It adds no new fact and never converts figures (no currency conversion, which would invent an exchange rate).
- The same code checks as any generation apply: locked facts and forbidden terms.
- Generating again from the evidence in the new language remains available as a separate action.

## Versions and language branches

Documents are versioned like a git history, stored as rows in Postgres rather than in a git repository.

- An application has one **language branch** per output language the user chose to create; the user decides which languages exist. Each branch holds that language's resume and cover letter.
- Every change to a document creates an immutable **version**: a full snapshot of the structured content, its parent version, its origin (generated, adapted, edited), its author (user or AI) and its time. Diffs between any two versions are computed when shown.
- The **latest version of each branch is the official one**. There is no manual "current" marker; the history exists so actions can be undone. Restoring an old version creates a new latest version with that content; history is never rewritten.
- An adaptation starts a new branch from a version of another branch and records that version as its base.

## Submission freeze

- When the user marks an application as applied, they say which language branches were sent; more than one can be sent.
- From then on every document of the application, in every branch, is read-only: no new versions, no syncs, no archiving or deleting of versions.

## Rendering

PDF and DOCX files are rendered on demand from a version's structured content. Since versions are immutable, a rendered file never goes stale: it may be cached in private Vercel Blob storage keyed by version and template, and the cache can be purged at any time without losing anything.

## Open points

- Language sync between branches (merging changes from one language into another) and how granular it is.
- Archiving and deleting versions and branches.
- Undoing a submission marked by mistake; reusing a frozen application as a starting point; deletion rights over frozen documents.
- Which output languages are offered.
- How locked facts such as job titles appear in another language.
