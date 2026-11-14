# StoryToRole spec: Workspace

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal

Every interaction between the user and the AI happens in one workspace modelled on the Claude app: a sidebar, a chat in the center and a side panel, with documents edited in place.

## Layout

- **Sidebar (left):** fixed items at the top, as in the Claude app: **My career** (the interview and the evidence base), **Library** (library documents, listed by focus) and **New opening**. Below them, the openings grouped by status: analyzed, in preparation, applied, in process, closed.
- **Chat (center):** the interaction itself. The user can attach files and links in the chat to do anything the product offers.
- **Side panel (right):** for an opening, four blocks are always shown: **Analysis** (the fit check's band, requirements and gaps), **Documents** (resume and cover letter with a tab per version, outdated notices, ATS check and which snapshot was sent), **Context** (what the AI is using in this chat: application instructions, sensitive-item overrides, locked-fact overrides) and **Usage** (plan consumption, or estimated cost for bring-your-own-key users). While a task runs, its agents and progress appear there too ("Generating resume: revision 2 of 3"). In the career interview, the panel shows the timeline of positions.
- **Documents:** opening a document edits it in the same screen, as the Claude app does with artifacts.

## Chat scope

Every chat belongs to a context: the career interview, an opening or a document. There is no general-purpose chat. The topic gate judges each message against its context; off-topic messages get a fixed reply and never reach the main model.

## Processing

AI processing runs in Trigger.dev tasks, never in the request that the chat sends. Each task streams its progress and output to the client and saves results to Postgres, so a closed tab loses nothing. Starting a task adds latency to every interview turn; it must be measured in the first prototype, keeping workers warm if needed.

## Links

Links attached in the chat are read by code, never by the model, which has no web access:

- An isolated Trigger.dev task with no database access and no AI keys makes a plain HTTP request. There is no browser, so no script on the page runs.
- Only http and https; the resolved address is rejected when private, loopback or link-local, checked again on every redirect; at most 3 redirects; short timeout; size limit; only HTML, plain text and PDF are accepted. The task returns text only.
- Pages that block automated reading, require login or only render with JavaScript lead to a request to paste the text. No user session, cookie or credential is ever used.
- The extracted text goes through the same content check as pasted text and enters prompts marked as third-party data, never as instructions.

## Open points

None at the moment.
