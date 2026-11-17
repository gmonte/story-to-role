# One profile_truth document is the source of truth, following the meu-emprego-novo method

StoryToRole implements the meu-emprego-novo method (its principles, the `profile_truth.md` master profile, screening, tailored resumes and their adjustment, the coverage review and application tracking), improved where software helps. The method keeps a whole career in one structured text file, written with an AI interviewer and approved by its owner, from which every resume is derived. Our first engine instead split the career into facts approved one by one and fed generation from them; in the owner's walkthrough that read as bookkeeping, repeated the same fact across files, and never showed the career as one text.

So the user's career is **one Markdown document**, `profile_truth.md`, in the method's template: professional identity, contact, experience (one section per position, titled `### Company — Title (YYYY-MM to YYYY-MM)`, with context, responsibilities, tools, results whose figures carry the marks `[medido]`, `[estimado]`, `[sem número]` or `[a confirmar]`, and what the user did not do), education, certifications with status and expiry, competencies by level (master, use often, studied), languages with real level, known gaps, communication rules and addenda.

- **The text is the source.** The user owns and edits the whole document, in a block editor that stores Markdown. A deterministic linter reads it on every edit, marks what breaks the template in the text, fixes what it safely can on demand, and extracts the structure the rest of the product reads: the timeline and locked facts (employer, title, dates), credentials, competencies, languages, gaps, rules and marked figures.
- **Draft, validate, publish.** Edits land in an autosaved draft with undo. Validating runs an AI quality review on what changed since the last published version (the user's credits); publishing makes the draft the official, numbered version, with or without validating. Format errors block publishing; quality findings never do. Only a published version feeds screening and generation, and each generated document freezes the version it used.
- **The AI suggests, the user decides.** An agent works on the passage the user selects or a finding they click: it interviews per the method's prompt, at most three questions per message, and proposes changes shown in place to accept or reject. Uploading a resume proposes only what the document lacks; a resume is a lead to confirm, so its figures arrive as `[a confirmar]`.

Job preferences and excluded companies, which the method keeps in a separate file, live in a separate document in the same editor, read only by screening.

## Consequences

- The guided interview, its sessions and draft facts, fact-by-fact approval, the per-position agents and their orchestrator, career events, evidence, stories and skills as tables, summaries, narratives and cross notes leave the product. The career chat's transport (ADR 0007) carries the single agent.
- Generation reads only figures marked `[medido]`, never what the user did not do, never what the communication rules forbid; code checks it, and a coverage review per document (the method's prompt 05) shows each requirement against the profile passage that backs it.
- The database is rebuilt from one baseline migration; the old engine's data is not converted.
