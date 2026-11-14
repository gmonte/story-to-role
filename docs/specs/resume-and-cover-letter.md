# StoryToRole spec: Resume and cover letter generation

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal and scope

For one opening, StoryToRole generates a tailored resume and cover letter from the approved evidence base (see [guided-interview.md](./guided-interview.md)) plus any application instructions the user adds. The AI invents nothing; what the user states is the user's responsibility.

Hiring interview prep is out of the MVP.

## Flow

1. The user adds an opening by pasting its description. Code first checks that the text looks like a job posting.
2. StoryToRole runs a **fit check** automatically and shows it as a hint, never as a gate: a band (high, medium or low fit), the opening's requirements that have evidence in the user's base (each linked to its evidence) and the main gaps. There is no percentage score, which would claim a precision the analysis does not have. It reads only the opening, the user's skills and the position summaries, never the whole evidence base, so it stays cheap. It counts as an evaluation in the plan, separate from generation. It is lighter than the review that follows resume generation; details belong to the fit assessment spec.
3. Whatever the fit check says, the user may generate a resume, a cover letter or both. Each document is generated only on demand.
4. The application starts when the first document is generated for the opening. Openings that were analyzed but never generated for stay in a list of analyzed openings, outside the tracker.

## Application instructions

- On the generation screen, the user can add free-text instructions that apply to this application only: a detail they just remembered, a different framing of an old position, or experience that is not in the evidence base. They are saved with the application when its first document is generated.
- StoryToRole does not verify whether these statements are true.
- Right after the user writes them, before generating, the system splits the instructions into points and asks, point by point, whether each one should also be added to the user's global evidence base. The AI pre-selects points that look like new career facts ("I led the Kubernetes migration in 2021") and leaves unselected points that look like adjustments for this opening ("emphasize people management"); the user confirms. Points added go through the same approval as interview evidence, sensitive-item flagging included; the others stay in this application only.
- An instruction that changes a locked fact (employer, title or dates of a position) creates a **locked-fact override** for this application only. The system shows it explicitly ("In this application, your title at Company X will be 'Engineering Manager' instead of 'Tech Lead'") and asks for confirmation; code then enforces the new value in this application. Locked facts guard against the AI, not against the user: the AI still may not change any of them on its own.
- Lines generated from an instruction trace back to that instruction, as interview evidence traces back to its turn.

## Cover letter and its resume

- A cover letter can be generated without a resume, but it is more accurate when generated from one.
- When generating a cover letter, the resume in the same output language is preselected if it exists; the user can pick another language version of the resume or generate without one.
- A cover letter generated from a resume records the exact resume snapshot it used. When that resume language version later gets a new snapshot, the cover letter is marked **outdated**, with a notice that the resume changed after the letter was generated. Changes to other language versions of the resume do not affect it.
- The notice offers two actions: **Update the cover letter** (primary), which adjusts only the passages affected by what changed in the resume since the snapshot it used, keeps the user's own edits, and is reviewed before becoming a snapshot; and **Generate again**, which rewrites the letter from the current resume (the old content stays in history). The user may also keep the letter as it is and dismiss the notice.

## Output language

- The user picks the output language before generating. It is preselected from the language detected in the opening description.
- After generating, the user can ask for a document in another output language at any time, which creates a new language version of that document. Every snapshot is kept.

## Adaptations

A snapshot in another output language is an **adaptation** of an existing snapshot, not a literal translation and not a fresh generation.

- It keeps the same evidence selection and the same evidence trace for every line.
- It rewrites wording for a native reader of that language and market: idiomatic action verbs, section names, date and number formats, and the opening's keywords in that language. Phrasing that does not work in the target language is reworked rather than translated word for word.
- It adds no new fact and never converts figures (no currency conversion, which would invent an exchange rate).
- The same code checks as any generation apply: locked facts and forbidden terms.
- Generating again from the evidence in the new language remains available as a separate action.

## Language versions and snapshots

Documents are versioned like a git history, stored as rows in Postgres rather than in a git repository. In git terms, a language version is a branch and a snapshot is a commit.

- An application has up to two **documents**: a resume and a cover letter.
- Each document has at most one **language version** per output language, created only when the user asks for it. For example, an application may hold one resume in Portuguese, one resume in English and one cover letter in English. Language versions are independent of each other, and the resume and the cover letter are independent of each other.
- Every change to a document creates an immutable **snapshot**: a full copy of the structured content, its parent snapshot, its origin (generated, adapted, edited), its author (user or AI) and its time. Diffs between any two snapshots are computed when shown.
- The **latest snapshot of each language version is the official one**. There is no manual "current" marker; the history exists so actions can be undone.
- Snapshots behave as a stack. **Undo** deletes the latest snapshot, making the previous one official; a snapshot below the top cannot be deleted on its own. Restoring an old snapshot creates a new latest snapshot with that content.
- The user can delete a whole language version, which deletes all of its snapshots and any cached files rendered from them. There is no archive: deletion is final and asks for confirmation.
- Side effects of deletion: when the snapshot a language sync would use as its base is gone, the sync uses the nearest remaining ancestor, or offers to recreate when none is left; when the resume snapshot a cover letter was generated from is gone, the letter is treated as generated without a resume; when a language version that another one was adapted from is gone, the other one simply continues on its own.
- An adaptation takes the latest snapshot of one language version as its base and writes the result either into a new language version or into an existing one. Into an existing language version it **recreates** it: the result becomes its new latest snapshot, replacing its content (edits made only in that language version are not carried over). Earlier snapshots stay in history, so recreating can be undone. Example: after many edits in English, the user recreates the Portuguese language version from the English one.

## Language sync

When one language version of a document has changes that another language version of the same document has not received, the behind one is marked outdated ("Outdated relative to Portuguese: 3 changes"). Nothing changes on its own.

- On demand, **language sync** carries the same ideas into the target by a three-way merge: the base is the source snapshot the target last came from (by adaptation or a previous sync), the source is the source's latest snapshot, and the target is the target's latest snapshot, whose own edits are preserved.
- The changes found in the source are listed one by one, all selected by default; the user unselects any they do not want. One AI call then adapts the selected changes into the target.
- Where both sides changed the same passage, both are shown and the user chooses.
- The result is a proposal: the user reviews the diff and accepts or discards it. Accepting creates a new latest snapshot in the target, which records the source snapshot as its new base.
- It works in any direction, always within one document (resume to resume, cover letter to cover letter). Recreating from another language version remains the alternative when the user wants to replace everything.

## Submission freeze

- When the user marks an application as applied, they say which language versions of each document were sent (for example, the English resume and the English cover letter).
- From then on every document of the application, in every language version, is read-only: no new snapshots, no syncs, no undo, no deletion of snapshots or language versions.

## Interface wording

The interface calls snapshots "changes" ("alterações" in Brazilian Portuguese): "Change history", "Restore this change". A language version is shown by its language name only, as a tab per language.

## Rendering

PDF and DOCX files are rendered on demand from a snapshot's structured content. Since snapshots are immutable, a rendered file never goes stale: it may be cached in private Vercel Blob storage keyed by snapshot and template, and the cache can be purged at any time without losing anything.

## Open points

- Undoing a submission marked by mistake; reusing a frozen application as a starting point; deletion rights over frozen documents.
- Which output languages are offered.
- How locked facts such as job titles appear in another language.
