# StoryToRole spec: Privacy and data protection

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Principles

StoryToRole handles the most personal professional data a person has. It keeps only what the product needs, for as long as it needs it, and nothing leaves its infrastructure that does not have to.

## The profile and the agent's messages

- The profile (`profile_truth`, see [profile-truth.md](./profile-truth.md)) is the user's own document: its draft, every published version, its suggestions and validation reports stay until the user deletes them or the account.
- The agent's messages are a working conversation, not the record: what matters ends up in the profile through suggestions the user accepts. They are deleted 7 days after they are written, and no AI call depends on keeping them.
- Each agent message carries only the passage under discussion, its section and the document's index, never the whole profile; generation carries only the passages it needs.
- Voice input never reaches StoryToRole as audio: the browser's speech recognition transcribes it (Google's service in Chrome and Edge, Apple's in Safari) and only the text the user confirms becomes a message. The privacy notice states which vendor hears the audio.

## Encryption and logs

- The profile and its versions, the agent's messages, imported resumes, truth files, job preferences and other career content are encrypted in the application before reaching the database, with a key per user protected by the master key (the same envelope scheme as bring-your-own keys). A database copy reveals nothing; content is decrypted in memory only when needed.
- **No content in logs, at any vendor.** Trigger.dev records each task's payload and output, and Vercel records request logs: tasks receive only IDs and load content from the database inside the task, and sensitive fields are marked so they are never logged.
- **The profile agent and the document agents are the one exception (ADR 0007, ADR 0009).** Its messages travel through the conversation's streams on Trigger.dev, the user's in and the reply out, and stay there until the session's 7-day deadline or the plan's retention window, whichever comes first. The transcript itself lives in StoryToRole's database, encrypted like the profile, and is deleted on the same 7-day clock; the run trace records no message. The privacy notice says so.

## Export and deletion

- **Export:** a button produces a ZIP with all of the user's data: the profile (every published version as `profile_truth.md`, and the draft), job preferences, applications, snapshots as JSON, and the PDFs.
- **Deletion:** deleting the account stops all use immediately and removes everything the app holds at once. Nothing is retained on purpose: what remains is only Neon's recovery history (point-in-time restore), which keeps every change for its history window (6 hours on the Free plan; 1 day by default, up to 7 or 30 days, on paid plans) and then drops it. The deletion notice states that window, from a setting that must follow the production project's (`privacySettings.databaseHistoryHours`). Deleting the user's key makes any copy left in that history unreadable. A restore keeps the state before it in a backup branch, which is deleted as soon as it isn't needed, so it never outlives the window.
- Only records the law requires are kept: the charges and invoices inside Stripe, with no career content. The Stripe customer (email, name, saved card) is deleted with the account, after its subscription is cancelled. Clerk data is deleted with the account; Upstash data expires on its own.
- Nothing about a deleted account is kept to recognize it later, not even a hash of the email: credits go with the account (the deletion dialog says how many are lost, bought ones included), and signing up again starts a new account, welcome credits included. Abuse is limited by sign-up (a verified email), not by retaining data.

## Data location and subprocessors

- Services run in the United States by default, where most free tiers of the stack operate (Vercel, Neon, Clerk, Trigger.dev, Upstash); Stripe and Anthropic (later OpenAI) are also abroad. The LGPD allows this with a valid transfer mechanism.
- Before launch, each vendor's data processing agreement is checked for the ANPD standard contractual clauses (Resolution CD/ANPD 19/2024, mandatory for contract-based transfers since August 23, 2025) or a Brazil addendum. If a data subject asks, the full clauses are provided within 15 days.
- The privacy policy lists each subprocessor, its country and what it receives, and states that Anthropic and OpenAI do not train models on API data.
- The database region is chosen for latency and cost, not for legal reasons.
- A contact channel for data subjects replaces a formal data protection officer while the ANPD rules for small processing agents allow it.
- The privacy policy gets a quick legal review before publication.

## Open points

None at the moment.
