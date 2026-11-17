# The AI invents nothing; the user owns what they state

StoryToRole promises that nothing in a generated document is invented, but it does not judge whether what the user says is true. The AI may only use the published version of the user's `profile_truth` (ADR 0008), application instructions and approved company facts; what a resume asks for and the profile doesn't show is a declared gap, never filled in. Code enforces locked facts (the employer, title and dates of each experience section) and the figure rules (only figures marked `[medido]`) against the AI. The user, however, may state anything, in their profile or in an application instruction, and may override a locked fact for a single application (a locked-fact override), which code then enforces there. We chose this because the tool's job is to stop the AI from embellishing, not to police the user: verifying user claims is impossible, and blocking users from framing their own history would make the product useless for legitimate tailoring.

## Consequences

- Locked facts guard against the AI only. A future reader seeing a title in a resume that differs from the profile should look for a locked-fact override on that application.
- Every generated line keeps a trace to its origin (a passage of the frozen profile version, an instruction or a manual edit), and the coverage review shows it, so responsibility stays visible.
