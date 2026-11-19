# StoryToRole spec: Tracker

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal

The tracker follows every application the user pursues, from the first document to the outcome, so the user stops keeping a spreadsheet: where they applied, with which resume, what came back and what comes next. It replaces the manual `tracker.csv` of the meu-emprego-novo method (its step 07) and keeps its columns and metrics.

## Applications in the tracker

- An application enters the tracker when its first document is generated or copied (see [resume-and-cover-letter.md](./resume-and-cover-letter.md)), or when the user marks the opening as applied or moves its status, even with no resume or cover letter written for it. Openings that were only analyzed, with neither, stay in a list of analyzed openings, outside the tracker.
- **Applying without a resume:** the opening page shows the status (“Not applied yet”) with “Mark as applied” and the status options even with no application; using them creates the application on the fly (the opening's owner only), with no documents. Marked as applied without documents, it has no submissions: the Sent section says “No resume recorded” and offers the same hand pick as an external application (a resume version, or not recorded). The applications list, board and metrics include it; the metrics group it under resume origin “Not recorded” and score “No score”.
- **External applications:** the user can create an application by hand for an opening they applied to outside StoryToRole (company, title, link and, optionally, the description), with no documents and no credits spent. It is marked external; it stops being external once a document is generated or copied for it.
- When the user marks an application as applied, it records the exact snapshot of each version sent; documents are never frozen.

## What each application records

The method's columns, beyond company, title, link and status:

| Field                       | Notes                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                      | Where the opening was found: LinkedIn, the company's site, a referral, a job board (a short list plus free text)                                                                    |
| Application type            | Simplified (one-click on a job board) or external (the company's own form)                                                                                                          |
| Resume sent                 | The family and version sent, recorded automatically when the document comes from StoryToRole, or picked by hand for an external application: what the user promised                 |
| Next step                   | Free text ("HR interview on Sep 20"), shown on the application and in reminders                                                                                                     |
| Notes                       | Free text                                                                                                                                                                           |
| Decline reason (the user's) | Why the user gave up, asked in a dialog when the status is set to Withdrawn (optional, editable later); it can become a rule in the job preferences document, which screening reads |

There is no field for recruiter contacts. Notes and next steps are free text, where names, emails and phone numbers end up: they are encrypted with the user's key and never reach any prompt. Anything the AI reads of the tracker is its structured fields (source, application type, resume sent, status, dates, decline reason).

## Metrics

The method's simple metrics, over the applications of a period the user picks:

- response rate by resume origin: written for the opening, copied or adapted from a library document (one row per document) or not recorded. A resume version is never a group: each opening has its own resume, so every version would be one application;
- response rate by resume score: the review rating of the resume sent against the target (8), below it, or no score;
- response rate by fit: the band of the opening's latest fit check, or not checked;
- response rate per source;
- median time from applying to the first response;
- how many high-fit openings (see the fit check's band) turned into an interview.

## Statuses and events

| Status         | Meaning                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| In preparation | The application exists (a document was generated or copied) but was not sent                                        |
| Applied        | The user marked it as sent; the sent snapshots are recorded                                                         |
| In process     | The company responded: screening, interview or test                                                                 |
| Offer          | An offer was received                                                                                               |
| Hired          | The user accepted (closed)                                                                                          |
| Rejected       | The company said no (closed)                                                                                        |
| Withdrawn      | The user gave up (closed)                                                                                           |
| No response    | Closed automatically after a configurable number of days with no event (30 by default); reopens if anything happens |

Details live in **events**, dated entries on the application's timeline ("HR interview on Nov 20", "technical test delivered"), instead of becoming statuses. Few statuses keep the funnel readable.

## Reminders

In-app only in the MVP, configurable and dismissible: a nudge to record a follow-up after some days without response ("You applied to Company X 10 days ago with no reply"), a reminder of a dated event ("Your interview is tomorrow"), and a warning before an application turns "No response". Email reminders come later; they need a transactional email service, which is one more subprocessor.

## The Applications page: list and kanban

One page, two views (`?view=list|kanban`, remembered per viewer), with the reminders, the metrics and "Applied elsewhere" above them.

- **List**: company, title, status, type, source, sent date or "Not sent", fit band and last activity; filters (status, type, company, sent or not) and sorting (last activity, sent date, company, status) are applied on the client and kept in the URL.
- **Kanban**: a column per status in tracker order. Dragging a card to another column changes its status by the select's rules: "Applied" opens the dialog that asks what was sent (allowed with nothing), "Withdrawn" opens the give-up dialog (cancelling leaves the card), "No response" accepts no drop (it only comes with time), and "Applied" is refused for an application not in preparation unless made elsewhere. Each card has a status menu as the keyboard alternative, and opens the opening page.

## Open points

None at the moment.
