# StoryToRole spec: Resume and cover letter generation

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal and scope

For one opening, StoryToRole generates a tailored resume and cover letter from the approved evidence base (see [guided-interview.md](./guided-interview.md)) plus any application instructions the user adds. The AI invents nothing; what the user states is the user's responsibility.

Hiring interview prep is out of the MVP.

## Openings and library documents

- An opening always has someone on the other side: a posted vacancy, or a company the user wants to approach with no vacancy open (for example, a cover letter for Airbnb). Openings of either kind can become applications and appear in the tracker.
- An unsolicited opening (no vacancy) requires only the company; the intended role or area, free notes and links are optional. With no requirements to compare, the fit check does not run, but the opening's vector (company, role, notes) still suggests similar library documents, and the intended role feeds `<Title>` in file names. It starts open and the user can close it, for example when the company replies that it has no vacancies.
- A **library document** is a resume or cover letter with no company behind it, generated from the evidence base. A user can keep several, each with a required **focus** that serves as its title: a stack or kind of role ("React Native", "React Web", "Frontend", "Full-stack Node"), or "General" for one that presents the strongest evidence overall. In the interface, the Library lists them by focus, with plain "New resume" and "New cover letter" actions. Library documents live outside any application, use the same versions, snapshots, undo, adaptation and language sync, skip the fit check and never appear in the tracker. Generating one does not start an application.

## Flow

1. The user adds an opening by pasting its description. Code first checks that the text looks like a job posting.
2. StoryToRole runs a **fit check** automatically and shows it as a hint, never as a gate. A small AI call extracts the opening's keywords (hard skills, tools, certifications, languages) and requirements (seniority, years of experience, location, work model). Each keyword and requirement retrieves the closest evidence by vector similarity; a cheap AI call then judges each one, seeing only the requirements and the retrieved evidence, never the whole evidence base, as met, partial or a gap. Vector similarity alone does not decide, since it misses seniority ("8+ years" against a junior history reads as similar) and hard requirements such as location or language. The hint shows a band (high, medium or low fit), each requirement linked to its evidence, and the main gaps; there is no percentage score, which would claim a precision the analysis does not have. It counts as an evaluation in the plan, separate from generation.
3. Next to the fit check, StoryToRole suggests existing documents similar to this opening, ranked by vector similarity between the opening and each document: library documents and documents from other applications, including ones already sent.
4. Whatever the fit check says, the user may get a resume, a cover letter or both, each only on demand, in one of three ways:
   - **Use as is:** the latest snapshot of the chosen document's version is copied as the first snapshot of this application's document. No AI call is made. If the chosen document is in another language than the output language, it is copied and adapted instead, following the adaptation rules; this makes an AI call and counts as a generation, which the user is told before confirming. The source document does not change.
   - **Use as reference:** a new document is generated for this opening with the chosen document as a reference, keeping what still fits and tailoring the rest. The user reviews the result. The source document does not change.
   - **Generate from scratch** from the evidence base.
5. The application starts when the first document is generated or copied for the opening. Openings that were analyzed but never generated for stay in a list of analyzed openings, outside the tracker.

## Embeddings

Embeddings are part of the MVP.

- Vectors exist for every approved evidence item, skill, document (the latest snapshot of each version), opening and opening keyword. An opening's vector is computed as soon as it is added, whether or not the user has documents yet.
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

## Cover letter inputs

A cover letter follows its own methodology and draws on two inputs a resume does not have:

- **Company research:** on request ("Research company"), a separate task searches the web with the provider's web search tool, within a limit of searches, and returns a short list of **company facts**, each with its source link. The user selects which facts to use; only those enter the cover letter's context, like approved evidence. Page text is third-party data, never instructions. The model that writes the letter still has no web access. Facts and their approval are stored with the application; there is no shared cross-user cache of company research, since caching the web is not viable. It costs credits, estimated before running.
- **Motivation interview:** three to five short questions, one at a time, by voice or text, about why the user wants this opening (what drew them to the company, how the role fits the moment of their career, any personal link to the product or mission). Answers are split into points like application instructions: points about this company stay in the application; points about the user ("I want to work on financial products", "I look for small teams") are offered for promotion to the global evidence base as **career goals**, point by point; a point becomes a career goal only after the user approves it, so later letters ask less. Each answer costs about 2 credits. The user can skip it; the letter is then marked "could improve with your motivation".
- **Story choice:** StoryToRole ranks the user's approved stories by similarity to the opening's requirements and shows the top three, each with a line on why it fits; the user picks one. When the chosen story lacks a turning point or detail, the motivation interview adds one or two questions about it ("when did you have to decide?"), and the answers enrich that story in the evidence base only if the user approves them.

**Methodology: storytelling.** Based on Braven's "The power of storytelling in your cover letter" (braven.org, 2019). The letter is built around one convincing story, not a list of skills:

1. **Opening:** an attention-getter tied to the letter's topic (a concrete fact about the company, a tagline, a short quote) that leads smoothly into the story. No stock greeting such as "I am writing to apply for".
2. **Story:** one past experience that exemplifies the skills and attributes the opening asks for, told as a plot: the setup, the build-up, the turning point and the final result. It must be clear about "the challenge, the choice you made, and the outcome", add something the resume does not already say, and show how the user would fit the company's culture. "Pick one story and stick with the highlights."
3. **Conclusion:** amplify the impression, connect the story to the role, express interest in talking (interview, follow-up, contact) without sounding needy or arrogant, and close formally.

Rules: about one page; personal, honest and enthusiastic; every sentence earns its place; no template phrasing ("hiring managers can sniff a template from a mile away"); no embellishment. The story comes only from approved evidence and the user's own words, and company facts only from approved research, so the letter invents nothing. Tone and length follow the output language's conventions in the tested language list.

## Cover letter and its resume

- A cover letter can be generated without a resume, but it is more accurate when generated from one.
- When generating a cover letter, the most recently changed resume version in the same output language is preselected if one exists; the user can pick another version of the resume or generate without one.
- A cover letter generated from a resume records the exact resume snapshot it used. When that resume version later gets a new snapshot, the cover letter is marked **outdated**, with a notice that the resume changed after the letter was generated. Changes to other versions of the resume do not affect it.
- The notice offers two actions: **Update the cover letter** (primary), which adjusts only the passages affected by what changed in the resume since the snapshot it used, keeps the user's own edits, and is reviewed before becoming a snapshot; and **Generate again**, which rewrites the letter from the current resume (the old content stays in history). The user may also keep the letter as it is and dismiss the notice.

## Output language

- The user picks the output language before generating. It is preselected from the language detected in the opening description.
- Output languages come from a tested list, starting with English and Brazilian Portuguese; each new language is added only after testing, with its market's conventions (date formats, section names, expected length) configured.
- No resume includes a photo, age or marital status in the MVP, whatever the market's custom. A user who wants that kind of information asks for it in one opening (as an application instruction) or in their global template.
- After generating, the user can ask for a document in another output language at any time, which creates a new version of that document. Every snapshot is kept. Two choices are offered, kept few on purpose so they stay clear to non-technical users: **Adapt from** an existing version (the default; same content rewritten for the new language, priced as an adjustment) or **Generate from scratch** from the evidence (priced as a generation). Only adaptation (and recreating, which is an adaptation) links the two versions for language sync; a version generated from scratch is independent.

## Adaptations

A snapshot in another output language is an **adaptation** of an existing snapshot, not a literal translation and not a fresh generation.

- It keeps the same evidence selection and the same evidence trace for every line.
- It rewrites wording for a native reader of that language and market: idiomatic action verbs, section names, date and number formats, and the opening's keywords in that language. Phrasing that does not work in the target language is reworked rather than translated word for word.
- It adds no new fact and never converts figures (no currency conversion, which would invent an exchange rate).
- The same code checks as any generation apply: locked facts and forbidden terms.
- **Titles in another language:** the first adaptation into a language proposes an equivalent for each position's title ("Analista de Sistemas Sênior" becomes "Senior Systems Analyst"); the user approves or edits it once, and that version becomes a locked fact of the position in that language. Code then accepts either the original or the approved title. Company names are never translated.
- Generating again from the evidence in the new language remains available as a separate action.

## Versions and snapshots

Documents are versioned like a git history, stored as rows in Postgres rather than in a git repository. In git terms, a version is a branch and a snapshot is a commit.

- An application has up to two **documents**: a resume and a cover letter.
- Each document has one or more **versions**, created only when the user asks for it. Each version has an output language and its own line of snapshots; a document may hold several versions in the same language. When the user asks for a version in a language the document already has, StoryToRole asks whether they really want another one. Versions are independent of each other, and the resume and the cover letter are independent of each other.
- **Duplicate** creates a new version in the same document from the latest snapshot of the current one, for example to keep a safe copy while experimenting. A duplicate is independent: it is not linked for language sync.
- Every change to a document creates an immutable **snapshot**: a full copy of the structured content, its parent snapshot, its origin (generated, adapted, edited), its author (user or AI) and its time. Diffs between any two snapshots are computed when shown.
- The **latest snapshot of each version is the official one**. There is no manual "current" marker; the history exists so actions can be undone.
- Snapshots behave as a stack. **Undo** deletes the latest snapshot, making the previous one official; a snapshot below the top cannot be deleted on its own. Restoring an old snapshot creates a new latest snapshot with that content.
- The user can delete a whole version, which deletes all of its snapshots and any cached files rendered from them. There is no archive: deletion is final and asks for confirmation.
- Side effects of deletion: when the snapshot a language sync would use as its base is gone, the sync uses the nearest remaining ancestor, or offers to recreate when none is left; when the resume snapshot a cover letter was generated from is gone, the letter is treated as generated without a resume; when a version that another one was adapted from is gone, the other one simply continues on its own.
- An adaptation takes the latest snapshot of one version as its base and writes the result either into a new version or into an existing one. Into an existing version it **recreates** it: the result becomes its new latest snapshot, replacing its content (edits made only in that version are not carried over). Earlier snapshots stay in history, so recreating can be undone. Example: after many edits in English, the user recreates the Portuguese version from the English one.

## Language sync

When one version of a document has changes that another version of the same document has not received, the behind one is marked outdated ("Outdated relative to Portuguese: 3 changes"). Nothing changes on its own.

- On demand, **language sync** carries the same ideas into the target by a three-way merge: the base is the source snapshot the target last came from (by adaptation or a previous sync), the source is the source's latest snapshot, and the target is the target's latest snapshot, whose own edits are preserved.
- The changes found in the source are listed one by one, all selected by default; the user unselects any they do not want. One AI call then adapts the selected changes into the target.
- Where both sides changed the same passage, both are shown and the user chooses.
- The result is a proposal: the user reviews the diff and accepts or discards it. Accepting creates a new latest snapshot in the target, which records the source snapshot as its new base.
- It works in any direction, always within one document (resume to resume, cover letter to cover letter). Recreating from another version remains the alternative when the user wants to replace everything.

## Submission record

- When the user marks an application as applied, they say which versions of each document were sent; the application records the exact snapshot of each, which shows as "sent" in the change history.
- Documents are never frozen: the user keeps editing, syncing and undoing as before, and since snapshots are immutable the sent content stays intact. Marking applied by mistake is undone by changing the status back.
- Deleting a version that holds a sent snapshot asks for confirmation; afterwards the tracker shows "sent version deleted". Deleting an application or the account always deletes everything, sent snapshots and cached PDFs included.
- Reusing a document from another application as a starting point works the same whether or not that application was sent.

## Interface wording

The interface calls snapshots "changes" ("alterações" in Brazilian Portuguese): "Change history", "Restore this change". Each version is shown as a tab named by its language, with a short label when a language repeats ("Portuguese", "Portuguese · copy"), which the user can rename.

## Rendering

Documents are downloaded as PDF only, in every plan, with no watermark. There is no DOCX export: edits stay inside StoryToRole, where every change is a snapshot and every line keeps its evidence trace, instead of drifting into a file edited elsewhere. PDFs are rendered on demand from a snapshot's structured content. Since snapshots are immutable, a rendered file never goes stale: it may be cached in private Vercel Blob storage keyed by snapshot and template, and the cache can be purged at any time without losing anything. Each section of a document (summary, each position, the whole cover letter) also has a **Copy text** action, for application forms that ask for pasted text; no editable file leaves the platform. Markdown and DOCX exports are not offered; DOCX may come back only for a concrete case of an opening that requires it. PDF file names follow one pattern, with the fixed words in the document's output language:

- Resume: `<FirstName>_<LastName>_<Title>_Resume.pdf` (Portuguese: `..._Curriculo.pdf`).
- Cover letter: `<FirstName>_<LastName>_<Title>_Cover_Letter.pdf` (Portuguese: `..._Carta_de_Apresentacao.pdf`).
- The company name never appears in PDF file names.
- `<Title>` comes from the opening's title, shortened by the AI during keyword extraction and editable by the user; for a library document it is the focus. The name is the one printed on the resume, not the Clerk account name.
- File names use ASCII only: accents, cedillas and symbols are removed and spaces become `_`, since some applicant tracking systems and portals break on accented file names. Example: `Guilherme_Monte_Engenheiro_de_Software_Senior_Frontend_Curriculo.pdf`.
- The pattern is a suggestion: the user can edit the file name before downloading.
- An application can also be downloaded as one ZIP named `<Company>_<Title>.zip`, so that unzipping creates a folder named after the opening, which helps the user organize uploads across many applications. It holds the PDF of the official snapshot of every version of the application's documents, named as above (without the company). When two versions would get the same file name, the version's label is appended (`..._Curriculo_copia.pdf`).
- `<Title>` comes from the opening's title, shortened by the AI during keyword extraction and editable by the user; for a library document it is the focus. The name is the one printed on the resume, not the Clerk account name.
- File names use ASCII only: accents, cedillas and symbols are removed and spaces become `_`, since some applicant tracking systems and portals break on accented file names. Example: `Guilherme_Monte_Engenheiro_de_Software_Senior_Frontend_Curriculo.pdf`.
- The pattern is a suggestion: the user can edit the file name before downloading.
- An application can also be downloaded as one ZIP (`<FirstName>_<LastName>_<Title>.zip`) holding the PDF of the official snapshot of every version of its documents. When two versions would get the same file name, the version's label is appended (`..._Curriculo_copia.pdf`).

Resume and cover letter layout are specified separately.

## Open points

