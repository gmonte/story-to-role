# Every AI call runs in Trigger.dev

All AI processing (the profile agent, validating the profile, importing a resume, screening, generation and its coverage review) runs as Trigger.dev tasks that stream progress and tokens to the client through Trigger.dev Realtime and save results to Postgres, never inside the web request. Resume generation with review rounds takes minutes and would exceed Vercel function limits; running everything the same way gives retries, durable progress (a closed tab loses nothing) and one place for cost accounting. Starting a task adds latency to each agent message; the agent runs on a long-lived chat run (ADR 0007) to keep it low. Tasks receive only IDs and load content inside the task, so no career content reaches Trigger.dev's logs.

## Consequences

- What needs no AI stays out of Trigger.dev: the profile's linter and its format fixes are plain code, run in the browser as the user types and again on the server when a draft is saved or published.
