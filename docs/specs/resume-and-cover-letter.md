# StoryToRole spec: Resume and cover letter generation

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal and scope

For one opening, StoryToRole generates a tailored resume and cover letter from the approved evidence base (see [guided-interview.md](./guided-interview.md)) plus any application instructions the user adds. The AI invents nothing; what the user states is the user's responsibility.

Hiring interview prep is out of the MVP.

## Openings and general documents

- An opening always has someone on the other side: a posted vacancy, or a company the user wants to approach with no vacancy open (for example, a cover letter for Airbnb). Openings of either kind can become applications and appear in the tracker.
- A **general document** is a resume or cover letter with no company behind it, generated from the evidence base. It may have an optional free-text focus, such as a stack or a kind of role ("React Native with Expo"); without one it presents the strongest evidence overall. General documents live in a library outside any application, use the same language versions, snapshots, undo, adaptation and language sync, skip the fit check and never appear in the tracker. Generating one does not start an application.

## Flow

1. The user adds an opening by pasting its description. Code first checks that the text looks like a job posting.
2. StoryToRole runs a **fit check** automatically and shows it as a hint, never as a gate. A small AI call extracts the opening's keywords (hard skills, tools, certifications, languages) and requirements (seniority, years of experience, location, work model). Each keyword and requirement retrieves the closest evidence by vector similarity; a cheap AI call then judges each one, seeing only the requirements and the retrieved evidence, never the whole evidence base, as met, partial or a gap. Vector similarity alone does not decide, since it misses seniority ("8+ years" against a junior history reads as similar) and hard requirements such as location or language. The hint shows a band (high, medium or low fit), each requirement linked to its evidence, and the main gaps; there is no percentage score, which would claim a precision the analysis does not have. It counts as an evaluation in the plan, separate from generation.
3. Next to the fit check, StoryToRole suggests existing documents similar to this opening, ranked by vector similarity between the opening and each document: general documents and documents from other applications, frozen ones included.
4. Whatever the fit check says, the user may get a resume, a cover letter or both, each only on demand, in one of three ways:
   - **Use as is:** the latest snapshot of the chosen document's language version is copied as the first snapshot of this application's document. No AI call is made. If the chosen document is in another language than the output language, it is copied and adapted instead, following the adaptation rules; this makes an AI call and counts as a generation, which the user is told before confirming. The source document does not change.
   - **Use as reference:** a new document is generated for this opening with the chosen document as a reference, keeping what still fits and tailoring the rest. The user reviews the result. The source document does not change.
   - **Generate from scratch** from the evidence base.
5. The application starts when the first document is generated or copied for the opening. Openings that were analyzed but never generated for stay in a list of analyzed openings, outside the tracker.

## Embeddings

Embeddings are part of the MVP.

- Vectors exist for every approved evidence item, skill, document (the latest snapshot of each language version), opening and opening keyword. An opening's vector is computed as soon as it is added, whether or not the user has documents yet.
- They are computed by a local multilingual embedding model running in a Trigger.dev task, since an opening may be in English while the evidence is in Portuguese. No AI vendor receives the text for this.
- They are stored with pgvector in the application's Postgres database.

## Review rounds

Generating a resume runs a loop: a strategist drafts, a reviewer rates the draft against the opening and lists gaps, and an editor applies the review. Each **review round** (review plus edit) rewrites the whole document, which makes rounds the largest generation cost.

- The user picks the depth before generating: **Quick** (one round) or **Thorough** (up to three rounds, stopping early when the rating reaches the target or stops improving). The best-rated version is kept. Each option shows its credit estimate.
- The number of rounds behind each option is a setting, not a constant, so it can be tuned with real data.
- Every round's rating, cost and outcome are stored, so the quality gained per extra round can be measured.

## Gap questions

The career interview is not repeated for every opening: the goal is that, once the evidence base is built, the user only adds an opening and asks for a document. Before generating, StoryToRole turns each gap found by the fit check into a question, one per point: does the user really lack it, or do they want to add a story for it? A story added there is an application instruction, so it can stay in this application or be promoted to the global evidence base, point by point, as any instruction.

## ATS check

After a resume is generated for an opening, StoryToRole compares it against the opening's keywords (hard skills, tools, certifications, languages) the way an applicant tracking system reads it: literally, as the opening spells each term. The result is factual ("14 of 18 keywords"), and the missing keywords are split in two:

- **You have it, use the opening's term:** the evidence base holds it under another spelling ("Postgres" for "PostgreSQL"); the user is advised to use the opening's term. A term is only suggested when evidence backs it.
- **Real gap:** no evidence for it.

The ATS check applies to generated resumes only; it plays no part in suggesting similar documents.

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

Documents are downloaded as PDF only, in every plan, with no watermark. There is no DOCX export: edits stay inside StoryToRole, where every change is a snapshot and every line keeps its evidence trace, instead of drifting into a file edited elsewhere. PDFs are rendered on demand from a snapshot's structured content. Since snapshots are immutable, a rendered file never goes stale: it may be cached in private Vercel Blob storage keyed by snapshot and template, and the cache can be purged at any time without losing anything. Each section of a document (summary, each position, the whole cover letter) also has a **Copy text** action, for application forms that ask for pasted text; no editable file leaves the platform. Markdown and DOCX exports are not offered; DOCX may come back only for a concrete case of an opening that requires it. Resume and cover letter layout are specified separately.

## Open points

- Undoing a submission marked by mistake; reusing a frozen application as a starting point; deletion rights over frozen documents.
- Which output languages are offered.
- How locked facts such as job titles appear in another language.
