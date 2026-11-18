# StoryToRole spec: Workspace

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal

Every interaction between the user and the AI happens in one workspace modelled on the Claude app: a sidebar, the work in the center and a side panel, with documents edited in place.

## Layout

- **Sidebar (left):** fixed items at the top, as in the Claude app: **My career** (the profile, see [profile-truth.md](./profile-truth.md)), **Library** (library documents, listed by focus) and **New opening**. Below them, the openings grouped by status: analyzed, in preparation, applied, in process, closed.
- **Center:** the interaction itself. In My career it is the profile's block editor, with the document's index on its left and the profile agent on its right; for an opening, its chat. The user can attach files and links to do anything the product offers.
- **Side panel (right):** for an opening, four blocks are always shown: **Analysis** (the fit check's band, requirements and gaps), **Documents** (resume and cover letter with a tab per version, outdated notices, ATS check and which snapshot was sent), **Context** (what the AI is using in this chat: application instructions, communication-rule overrides, locked-fact overrides) and **Usage** (plan consumption, or estimated cost for bring-your-own-key users). While a task runs, its agents and progress appear there too ("Generating resume: revision 2 of 3"). Job preferences have their own document, in the same editor as the profile.
- **Documents:** opening a document edits it in the same screen, as the Claude app does with artifacts.

## The opening page

One structure for every state of an opening, like My career's (design review in [docs/design/opening-page-review.md](../design/opening-page-review.md)); it replaces the opening's “side panel blocks” above.

- **Header (sticky):** the opening's title and company, its state chips (band, application status), a `⋯` menu (Close the opening, Never recommend this company) and **one primary action for the state**: Analyze/Check again, Answer N questions, Generate resume, Write the cover letter, Mark as applied, Record a reply.
- **Journey tabs, always the same and always present:** **Opening → Fit → Resume → Cover letter → Application**. A step with nothing yet shows an empty state with its action; a step never disappears and the layout never jumps between steps.
- **Left column:** the journey checklist (what's done, what's next) and the Context (application instructions, overrides); in the Resume and Cover letter steps, the document's index, findings, coverage review and ATS check (the document workspace).
- **Center:** the step's content. Opening: the description, annotated. Fit: each requirement as a card with its verdict, the profile passages or “your answer for this opening” behind it, and its gap question inside the card. Resume: the document workspace; when there is none, three ways in — generate from the profile, start from a similar document, adapt a version. Cover letter: History → Motivation → Company facts → Letter, then the letter in the workspace. Application: the full tracker (status, sent versions, timeline, source, type, notes), shared with the Tracker page.
- **Right column, fixed tabs in every step:** **Agent · Fit · Application**. The agent is the opening's agent in the Opening/Fit/Application steps and the document's agent in the Resume/Cover letter steps (ADR 0009, ADR 0010); Fit is the compact fit check (clickable to the step); Application is a summary (status, Mark as applied, next step). The PDF preview opens as a fourth column.
- **Mobile:** the right column becomes a sheet; the left column an accordion; nothing is hidden.

## Onboarding

Right after sign-up the user chooses how to start:

- **"I have an opening in mind"** (highlighted): upload the current resume, a truth file, or say there is none; review the profile's first draft and publish it (validated or not); then paste the opening or its link and see the fit check as the first proof of value; answer its gap questions; get the resume. The resume comes before the opening because the fit check reads only a published profile (ADR 0006).
- **"I want to organize my career first":** the privacy notice, then the profile: upload a resume, ask the agent to "interview me", or write in the template; publish; then the first opening.

The privacy notice appears along the way, only when needed.

## Chat scope

Every chat belongs to a context: the profile agent, an opening or a document. There is no general-purpose chat. The topic gate judges each message against its context; off-topic messages get a fixed reply and never reach the main model.

## Processing

AI processing runs in Trigger.dev tasks, never in the request that the chat sends. Each task streams its progress and output to the client and saves results to Postgres, so a closed tab loses nothing. Starting a task adds latency to every agent message; the profile agent runs on a long-lived chat run to keep it low (ADR 0007). The profile's linter is plain code and runs in the browser.

## Links

Links attached in the chat are read by code, never by the model, which has no web access:

- An isolated Trigger.dev task with no database access and no AI keys makes a plain HTTP request. There is no browser, so no script on the page runs.
- Only http and https; the resolved address is rejected when private, loopback or link-local, checked again on every redirect; at most 3 redirects; short timeout; size limit; only HTML, plain text and PDF are accepted. The task returns text only.
- Pages that block automated reading, require login or only render with JavaScript lead to a request to paste the text. No user session, cookie or credential is ever used.
- The extracted text goes through the same content check as pasted text and enters prompts marked as third-party data, never as instructions.

## Open points

None at the moment.
