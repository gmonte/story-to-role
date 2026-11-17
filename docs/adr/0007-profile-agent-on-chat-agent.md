# The profile agent runs on Trigger.dev chat.agent, and its messages pass through Trigger.dev

The profile editor has an agent the user talks to about a passage of their `profile_truth` (ADR 0008). Built as one task per message (ADR 0003), each turn paid for a run boot and nothing streamed. Trigger.dev's `chat.agent` gives one durable run per conversation, token streaming, resume after a reload and stop, so the agent is built on it: one agent per user, which receives the passage, its section and the document's index (never the whole document), asks per the method's interview prompt, and proposes changes through a tool that the editor shows in place for the user to accept or reject.

This amends ADR 0003 in one point. Tasks still receive only ids and AI calls still run in Trigger.dev, but the agent's messages travel through the session's streams on Trigger.dev (the user's messages in, the reply out), where they stay for the plan's retention window or until the session's own deadline, whichever comes first. The owner accepted this over building the streaming ourselves.

What keeps the exposure small:

- The transcript lives in our tables, encrypted with the user's key, through our own transcript storage, so Trigger.dev keeps no snapshot copy.
- The run trace records neither the user's message nor client data (`telemetry`), and the agent's model calls send no telemetry.
- Each session is created with a retention deadline of 7 days; our copy of the messages is purged on the same clock. A conversation whose session expired starts a new one.
- The agent identifies the user by the chat id, which only our server hands out after checking ownership; nothing the browser sends decides whose data a turn reads.
- Deleting an account closes its sessions; Trigger.dev has no delete for a session, so their streams age out with the retention window.

## Consequences

- What the agent says without a model call goes through the same conversation: a reply decided by code (off topic, out of credits) and the summary of a finished import, which the page asks for with a `catch_up` action and the agent says once, at no cost.
- The privacy spec and notice say that the agent's messages pass through Trigger.dev for up to 7 days.
- Credits are reserved and settled per message, not per run.
