# The guided start asks for the resume before the opening

The workspace spec lists the "I have an opening in mind" path as: paste the opening, upload the current resume (or a truth file, or say there is none), see the fit check, then get the resume. The fit check reads only the published version of the profile (ADR 0008) and runs once, when the opening is analyzed. Asked for in the spec's order, the first fit check would always judge an empty profile and show every requirement as a gap, which is the opposite of "the first proof of value". So the guided path asks for the resume first: the upload proposes the first draft of the profile, the user reviews and publishes it (validated or not), and only then pastes the opening. A user with no resume gets the agent's interview first, or the opening anyway, its gap questions filling what is missing.

## Consequences

- The path's steps are the spec's, in a different order; the outcome (fit check, gap questions, resume) is unchanged and happens on the opening's page.
- If the fit check later learns to rerun when a new version is published, the spec's order works again and this decision can be revisited.
