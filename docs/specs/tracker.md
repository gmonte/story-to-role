# StoryToRole spec: Tracker

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal

The tracker follows every application the user pursues, from the first document to the outcome, so the user stops keeping a spreadsheet. It replaces the manual `tracker.csv` of the meu-emprego-novo method.

## Applications in the tracker

- An application enters the tracker when its first document is generated or copied (see [resume-and-cover-letter.md](./resume-and-cover-letter.md)). Openings that were only analyzed stay in a list of analyzed openings, outside the tracker.
- **External applications:** the user can create an application by hand for an opening they applied to outside StoryToRole (company, title, link and, optionally, the description), with no documents and no credits spent. It is marked external; it stops being external once a document is generated or copied for it.
- When the user marks an application as applied, it records the exact snapshot of each version sent; documents are never frozen.

## Statuses and events

| Status | Meaning |
| --- | --- |
| In preparation | The application exists (a document was generated or copied) but was not sent |
| Applied | The user marked it as sent; the sent snapshots are recorded |
| In process | The company responded: screening, interview or test |
| Offer | An offer was received |
| Hired | The user accepted (closed) |
| Rejected | The company said no (closed) |
| Withdrawn | The user gave up (closed) |
| No response | Closed automatically after a configurable number of days with no event (30 by default); reopens if anything happens |

Details live in **events**, dated entries on the application's timeline ("HR interview on Nov 20", "technical test delivered"), instead of becoming statuses. Few statuses keep the funnel readable.

## Open points

- Reminders and next steps.
