# StoryToRole spec: Workspace

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal

Every interaction between the user and the AI happens in one workspace modelled on the Claude app: a sidebar, a chat in the center and a side panel, with documents edited in place.

## Layout

- **Sidebar (left):** the openings, grouped by status.
- **Chat (center):** the interaction itself. The user can attach files and links in the chat to do anything the product offers.
- **Side panel (right):** the contexts or agents involved and the documents.
- **Documents:** opening a document edits it in the same screen, as the Claude app does with artifacts.

## Processing

AI processing runs in Trigger.dev tasks, never in the request that the chat sends. Each task streams its progress and output to the client and saves results to Postgres, so a closed tab loses nothing.

## Open points

- How the chat-centered workspace fits the "no open chat surface" guardrail.
- How links attached in the chat are read, given that the main model has no web access.
- What the side panel's "contexts or agents" are.
- Where the career interview and the library of general documents live in the sidebar.
