# The AI invents nothing; the user owns what they state

StoryToRole promises that nothing in a generated document is invented, but it does not judge whether what the user says is true. The AI may only use approved evidence, application instructions and approved company facts, and code enforces locked facts (employer, title, dates) against the AI. The user, however, may state anything, including experience that is not in the evidence base, and may override a locked fact for a single application (a locked-fact override), which code then enforces there. We chose this because the tool's job is to stop the AI from embellishing, not to police the user: verifying user claims is impossible, and blocking users from framing their own history would make the product useless for legitimate tailoring.

## Consequences

- Locked facts guard against the AI only. A future reader seeing a title in a resume that differs from the approved position should look for a locked-fact override on that application.
- Every generated line keeps a trace to its origin (evidence quote, instruction or manual edit), so responsibility stays visible.
