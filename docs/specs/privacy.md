# StoryToRole spec: Privacy and data protection

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Principles

StoryToRole handles the most personal professional data a person has. It keeps only what the product needs, for as long as it needs it, and nothing leaves its infrastructure that does not have to.

## Transcripts

- Interview turns exist while a session runs, since they are the interviewer's context until a checkpoint or the end of the position.
- They are deleted 7 days after the session's extraction is approved; the window allows undoing or redoing a just-approved extraction.
- What remains is the approved evidence, each item with the exact quote of the user's words (or the document passage) it came from, so traceability survives.
- Closed sessions are never read back by any AI call, so nothing depends on keeping transcripts.

## Encryption and logs

- Interview turns, evidence quotes, imported resumes, truth files and other career content are encrypted in the application before reaching the database, with a key per user protected by the master key (the same envelope scheme as bring-your-own keys). A database copy reveals nothing; content is decrypted in memory only when needed.
- **No content in logs, at any vendor.** Trigger.dev records each task's payload and output, and Vercel records request logs: tasks receive only IDs and load content from the database inside the task, and sensitive fields are marked so they are never logged.

## Export and deletion

- **Export:** a button produces a ZIP with all of the user's data: evidence base, positions, applications, snapshots as JSON, and the PDFs.
- **Deletion:** deleting the account stops all use immediately; removal is final within 30 days, the time for database backups to expire, which must match the retention configured in Neon. Deleting the user's key makes any copy left in a backup unreadable.
- Only records the law requires are kept (invoices in Stripe), with no career content. Clerk data is deleted with the account; Upstash data expires on its own.

## Data location and subprocessors

- Services run in the United States by default, where most free tiers of the stack operate (Vercel, Neon, Clerk, Trigger.dev, Upstash); Stripe and Anthropic (later OpenAI) are also abroad. The LGPD allows this with a valid transfer mechanism.
- Before launch, each vendor's data processing agreement is checked for the ANPD standard contractual clauses (Resolution CD/ANPD 19/2024, mandatory for contract-based transfers since August 23, 2025) or a Brazil addendum. If a data subject asks, the full clauses are provided within 15 days.
- The privacy policy lists each subprocessor, its country and what it receives, and states that Anthropic and OpenAI do not train models on API data.
- The database region is chosen for latency and cost, not for legal reasons.
- A contact channel for data subjects replaces a formal data protection officer while the ANPD rules for small processing agents allow it.
- The privacy policy gets a quick legal review before publication.

## Open points

None at the moment.
