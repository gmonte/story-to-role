# StoryToRole spec: Tracker

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal

The tracker follows every application the user pursues, from the first document to the outcome, so the user stops keeping a spreadsheet. It replaces the manual `tracker.csv` of the meu-emprego-novo method.

## Applications in the tracker

- An application enters the tracker when its first document is generated or copied (see [resume-and-cover-letter.md](./resume-and-cover-letter.md)). Openings that were only analyzed stay in a list of analyzed openings, outside the tracker.
- **External applications:** the user can create an application by hand for an opening they applied to outside StoryToRole (company, title, link and, optionally, the description), with no documents and no credits spent. It is marked external; it stops being external once a document is generated or copied for it.
- When the user marks an application as applied, it records the exact snapshot of each version sent; documents are never frozen.

## Open points

- Application statuses and the events recorded over time.
- Reminders and next steps.
