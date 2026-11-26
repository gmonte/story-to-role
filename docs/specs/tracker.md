# StoryToRole spec: Tracker

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal

The tracker follows every application the user pursues, from the first document to the outcome, so the user stops keeping a spreadsheet: where they applied, with which resume, what came back and what comes next. It replaces the manual `tracker.csv` of the meu-emprego-novo method (its step 07) and keeps its columns and metrics.

## Applications in the tracker

- An application enters the tracker when its first document is generated or copied (see [resume-and-cover-letter.md](./resume-and-cover-letter.md)), or when the user marks the opening as applied or moves its status, even with no resume or cover letter written for it. Openings that were only analyzed, with neither, have no application: the Openings page still lists them (as “Analyzed”, see below), but the metrics never count them.
- **Applying without a resume:** the opening page shows the status (“Not applied yet”) with “Mark as applied” and the status options even with no application; using them creates the application on the fly (the opening's owner only), with no documents. Marked as applied without documents, it has no submissions: the Sent section says “No resume recorded” and offers a hand pick (a resume version, or not recorded). The applications list, board and metrics include it; the metrics group it under resume origin “Not recorded” and score “No score”.
- **Applications made elsewhere:** an application made outside StoryToRole is an opening like any other: added on New opening (analyzed, or registered without analysis, see [resume-and-cover-letter.md](./resume-and-cover-letter.md#flow)) and marked as applied with the day it was sent. There is no separate kind of application.
- When the user marks an application as applied, it records the exact snapshot of each version sent; documents are never frozen.

## What each application records

The method's columns, beyond company, title, link and status. The method's application type (a quick apply or a form made for the opening) is not kept: in StoryToRole almost every application sends a resume written for the opening, so the resume's origin (written for the opening, from the library, not recorded), read from what was sent, says more.

| Field                       | Notes                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                      | Where the opening was found: LinkedIn, the company's site, a referral, a job board (a short list plus free text)                                                                    |
| Resume sent                 | The family and version sent, recorded automatically when the document comes from StoryToRole, or picked by hand when none was sent from it: what the user promised                  |
| Next step                   | Free text ("HR interview on Sep 20"), shown on the application and in reminders                                                                                                     |
| Notes                       | Free text                                                                                                                                                                           |
| Decline reason (the user's) | Why the user gave up, asked in a dialog when the status is set to Withdrawn (optional, editable later); it can become a rule in the job preferences document, which screening reads |

There is no field for recruiter contacts. Notes and next steps are free text, where names, emails and phone numbers end up: they are encrypted with the user's key and never reach any prompt. Anything the AI reads of the tracker is its structured fields (source, resume sent, status, dates, decline reason).

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

## The Openings page

The sidebar item **Openings** (`/app/openings`) lists every opening the user added, analyzed or not, with or without an application, closed ones included. A layout shared by its three tabs holds the title and the active reminders, above the tabs, so the reminders show on every tab. The tabs are links, one route each: **Tracking** (`/app/openings`), **Calendar** (`/app/openings/calendar`) and **Settings** (`/app/openings/settings`). The opening page (`/app/openings/{openingId}`) is outside the layout.

### Where an opening stands

Each opening listed has one board status: its application's status when it has one, else **Not analyzed** (registered without analysis), **Analyzed**, or **Closed** (a closed opening with no application). Openings still processing, whose analysis failed or that were refused never appear. An opening is **open** while its board status is Not analyzed, Analyzed, In preparation, Applied, In process or Offer and the opening itself is not closed; otherwise it is **closed**.

### The filter

Tracking and Calendar share one filter, kept in the URL and carried when switching between them. It is a bar of chips, as in GitLab's issue filter: clicking it lists the fields, then “is” or “is not”, then one or more values, and the choice becomes a chip; free text searches company and title. Values of one field combine with OR, fields with AND.

| Field   | Values                                                                       |
| ------- | ---------------------------------------------------------------------------- |
| Status  | The board statuses: Not analyzed, Analyzed, the application statuses, Closed |
| State   | Open, closed                                                                 |
| Company | Text                                                                         |
| Source  | The application's source list                                                |
| Fit     | High, medium, low, not checked (the opening's latest fit check)              |
| Sent    | Yes, no                                                                      |
| Resume  | Written for the opening, from the library, not recorded (what was sent)      |

The default filter is **State is open**, shown as a removable chip; removing it is a state of its own in the URL. Whenever the filter differs from the default, the bar says so (“Not the default filter · Restore default”), the chips that are not the default stand out, and the count of matching openings shows. Notes, next steps and decline reasons are never searched.

Filtering runs on the server, which pages the results (ADR 0013); company, title and the free text are encrypted, so the service decrypts them only when the filter or the sort needs them (ADR 0014).

### Tracking: metrics, list and kanban

The metrics come first, in a collapsible block (collapsed by default, remembered per viewer), above the filter: they ignore the filter, keep their own period and count applications only. Below the filter, two views (`?view=list|kanban`, remembered per viewer).

- **List**: company, title, board status, resume (its origin), source, sent date, fit band and last activity; an opening with no application shows “—” for what it lacks, and its last activity is when it was added. Sorting by last activity (the default), sent date, company or status. It loads a page at a time as the page scrolls.
- **Kanban**: full width, a column per board status in this order: Not analyzed, Analyzed, In preparation, Applied, In process, Offer, Hired, Rejected, Withdrawn, No response, Closed. Each column loads its own pages as it scrolls inside, and its header shows how many openings it holds. Dragging a card to another column changes its status by the select's rules: “Applied” opens the dialog that asks what was sent (allowed with nothing), “Withdrawn” opens the give-up dialog (cancelling leaves the card), “No response” accepts no drop (it only comes with time), and “Applied” is refused for an application not in preparation unless made elsewhere. A card dragged out of Not analyzed or Analyzed creates the application on the fly, as “Mark as applied” does on the opening page; such a card dropped on Closed closes the opening; nothing can be dropped on either (an application is never undone, and only an analysis makes an opening analyzed), and Closed takes only cards from them. The card moves at once and goes back if the change fails. Each card has a status menu as the keyboard alternative, and opens the opening page.

### Calendar

A month of **milestones**, one month at a time (`?month=2026-11`, previous, today and next), for the openings the filter matches, laid out in the viewer's time zone; on a phone, the same month as a list by day. The milestones are the opening added, the application applied, each status change, each dated note on the timeline (a note's text shows only on screen) and two projections, drawn dashed and only ahead: the follow-up reminder and the day the application would turn “No response”, from the reminder settings. The next step has no date and is not a milestone.

- One marker per opening per day, labelled with that day's most advanced milestone, with a “+N” badge when the opening has more that day; hovering or tapping it opens a popover with all of them in order and a link to the opening. “Opening added” is a marker only when it is the opening's only milestone that day.
- Two modes (`?show=latest|timeline`): **Latest or next** (the default) shows one marker per opening, its next milestone ahead, else its latest one; **Whole timeline** shows them all.
- The calendar only shows; events are recorded on the opening page.

### Settings

The reminder settings: on or off, the days before the follow-up nudge, the days without any event before “No response”.

## Open points

- Recording an event from the calendar (clicking a day): it would need the opening and, for an opening with no application, a status first.
