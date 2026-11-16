# The career chat runs on Trigger.dev chat.agent, and its messages pass through Trigger.dev

The guided-interview spec asks for one conversation in front of an orchestrator and one agent per position. Built as one task per message (ADR 0003), each turn paid for a run boot, nothing streamed, and a single chat across positions would have needed our own durable streaming and resume. Trigger.dev's `chat.agent` gives one durable run per conversation, token streaming, resume after a reload and stop, so the career chat is built on it: the orchestrator streams through the AI SDK, and the existing position agents run as its tool, each with its own session, drafts, quote checks and approval as before.

This amends ADR 0003 in one point. Tasks still receive only ids and AI calls still run in Trigger.dev, but the career chat's messages travel through the session's streams on Trigger.dev (the user's messages in, the reply out), where they stay for the plan's retention window or until the session's own deadline, whichever comes first. The owner accepted this over building the streaming ourselves.

What keeps the exposure small:

- The transcript lives in our tables, encrypted with the user's key (`career_chat_messages`), through our own transcript storage, so Trigger.dev keeps no snapshot copy.
- The run trace records neither the user's message nor client data (`telemetry`), and the orchestrator's model calls send no telemetry.
- Each session is created with a retention deadline of 7 days (`careerChatSettings.retentionDays`); our copy of the messages is purged on the same clock. A conversation whose session expired starts a new one.
- The agent identifies the user by the chat id, which only our server hands out after checking ownership; nothing the browser sends decides whose data a turn reads.
- Deleting an account closes its sessions; Trigger.dev has no delete for a session, so their streams age out with the retention window.

## Consequences

- The privacy spec and notice say that interview messages pass through Trigger.dev for up to 7 days.
- Credits are reserved and settled per message (a `career_chat_turn` task row), not per run.
- Interview turns are no longer separate tasks for the chat; `interview_turn` stays for the old path until it's removed.
