# StoryToRole spec: Workspace

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal

Every interaction between the user and the AI happens in one workspace modelled on the Claude app: a sidebar, the work in the center and a side panel, with documents edited in place.

## Layout

- **Sidebar (left):** fixed items at the top, as in the Claude app: **My career** (the profile, see [profile-truth.md](./profile-truth.md)), **LinkedIn** (the LinkedIn texts, see [resume-and-cover-letter.md](./resume-and-cover-letter.md#linkedin)), **Library** (library documents, listed by focus), **Openings** (every opening, its tracking and calendar, see [tracker.md](./tracker.md#the-openings-page)) and **New opening**. Below them, the openings grouped by status: not analyzed, analyzed, in preparation, applied, in process, closed, each group with its three latest (by last activity) and “See more (N)”, which opens the Openings page filtered by that status. Openings being analyzed, whose analysis didn't finish or that couldn't be analyzed are all listed, as they never reach the Openings page. An empty group is not shown.
- **Center:** the interaction itself. In My career it is the profile's block editor, with the document's index on its left and the profile agent on its right; for an opening, its chat. The user can attach files and links to do anything the product offers.
- **Side panel (right):** for an opening, four blocks are always shown: **Analysis** (the fit check's band, requirements and gaps), **Documents** (resume and cover letter with a tab per version, outdated notices, ATS check and which snapshot was sent), **Context** (what the AI is using in this chat: application instructions, communication-rule overrides, locked-fact overrides) and **Usage** (plan consumption, or estimated cost for bring-your-own-key users). While a task runs, its agents and progress appear there too ("Generating resume: revision 2 of 3"). Job preferences have their own document, in the same editor as the profile.
- **Documents:** opening a document edits it in the same screen, as the Claude app does with artifacts.

## The opening page

Three pages under one header, each one screen (design review in [docs/design/opening-page-review.md](../design/opening-page-review.md), with the owner's revision); it replaces the opening's “side panel blocks” above. There is no opening agent: each document has its own (ADR 0009), and both receive what the user answered and chose for the opening.

- **Header:** on the opening page, the title and company, the state chips (band, application status, warning signs), a `⋯` menu (Close or Reopen the opening, Never recommend this company, Delete the opening: after a confirmation it deletes the opening with its application, the documents written for it, the answers and the research, for good), **one primary action for the state** (Analyze, Answer N questions, Generate resume, Write the cover letter, Mark as applied, Record what happened) and a compact switch **Opening · Resume · Cover letter**. The header is the same on the opening, resume and cover letter pages, laid out like a GitHub issue's: the title large, the chips below it, and the switch as tabs with an icon and a count under them.
- **Opening page, three columns on one screen** (each scrolls on its own):
  - **Left, Fit:** the band (never a percentage) with Check again, the job preferences it breaks, and each requirement as a card with its verdict, the profile passages (or “your answer for this opening”) behind it and, when the opening asks for something the profile doesn't show, its gap question inside the card (I have it with where it happened, or I don't have it). Every gap and partial card is answerable: a gap the profile declares offers “This isn't a gap”, and a condition (work model, schedule, location, travel…) offers “I meet it”, “I don't meet it, but it's not a blocker for me” or “It's a blocker for me” with an optional note and, for a blocker, “Add to my job preferences”. The answer shows on the card (“Your answer: …” with Edit and Undo), a blocker shows a warning on the card and in the band card (“You marked 1 blocker”), and the check reads as outdated until it runs again. There is no separate question list.
  - **Center, the opening's description**, with the method's warning signs marked above it; while it is being analyzed, the analysis' progress. An analysis that breaks never stays on its progress: a first analysis leaves the opening failed ("the analysis didn't finish, no credits were used") with **Try again** in the header, at its usual cost, and a new check of an analyzed opening keeps the previous result with a note that the last check didn't finish. A run that dies without a word (a crash, a deploy) is caught by a sweep every ten minutes once past its time limit.
  - **Right, Application** (like an issue tracker's sidebar): the full tracker summary: status, Mark as applied (also with no application yet: the status shows as “Not applied yet” and applying or moving it creates the application with no document, keeping “Go to the resume” as a secondary link), the versions sent, the next step; Edit details and Timeline collapsed. Giving up is the Withdrawn status: picking it opens a dialog for the optional reason (with “Add as a discard rule”), cancelling keeps the previous status, and a withdrawn application shows its reason with an Edit link. Excluding the company lives only in the header’s ⋯ menu (“Never recommend {company} again”).
  - No “Context” block: the application instructions and overrides the AI uses appear in the resume and cover letter pages, where they apply.
- **Resume and Cover letter pages, full screen, without the application controls:** the document workspace: the document's index, findings and the application's instructions on the left, the document in the center, and on the right the document's agent, its PDF preview and its versions. With no document yet, the page is full screen too, with its actions: the resume's three ways in (generate from the profile, start from a similar document, adapt a version) and the cover letter's preparation (History → Motivation → Company facts → Letter).
- **Narrow screens:** below about 1280 px the Application column collapses behind a header button (a sheet) and Fit goes below the description; below `lg` everything stacks in one column and nothing is hidden. On the document pages the right column becomes a sheet below `lg`.
- **On a phone (below `md`, 768 px):** the opening page keeps the description as its body and gains a sticky bottom bar (clear of the home indicator, targets at least 44 px): **Fit** (a bottom sheet with the Fit column, labelled with the band), **Application** (a sheet with the Application column, labelled with the status) and the state's next step: Answer N questions opens the Fit sheet, Generate resume and Write the cover letter open their pages, Mark as applied and Record what happened open the Application sheet; Analyze, Reopen, Go to My career and Add it again stay in the header, so the bar has no third button then. The header's title wraps and its chips and tabs scroll sideways. The document pages open in **read mode** (the PDF look, suggestions still visible with Accept and Reject) with a floating **Edit** button that becomes **Done**; the index and findings are a sheet behind an **Index** button in the toolbar; the right column becomes a bottom bar of **Agent**, **Preview** and **Versions**, each a tall sheet. Nothing scrolls sideways at 375 px.

## Onboarding

Right after sign-up the user chooses how to start:

- **"I have an opening in mind"** (highlighted): upload the current resume, a truth file, or say there is none; review the profile's first draft and publish it (validated or not); then paste the opening or its link and see the fit check as the first proof of value; answer its gap questions; get the resume. The resume comes before the opening because the fit check reads only a published profile (ADR 0006).
- **"I want to organize my career first":** the privacy notice, then the profile: upload a resume, ask the agent to "interview me", or write in the template; publish; then the first opening.

The privacy notice appears along the way, only when needed.

Afterwards, the workspace opens on the Openings page once the profile is published, and on My career until then.

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
