# Each generated document has its own agent, on chat.agent like the profile's

The owner wants the resume and the cover letter edited the way the profile is (ADR 0008): the document in its PDF look, editable in blocks, with an agent beside it that the user talks to about a passage or a finding. So every generated document gets a **document agent**: one conversation per document (a resume or a cover letter), on Trigger.dev `chat.agent` like the profile agent (ADR 0007), with the same privacy model: transcript in our tables encrypted with the user's key, no client data in run traces, a 7-day session deadline, ownership checked on our server.

It is not the generation itself continued: a generation is a fixed pipeline (draft, review rounds, fixes), not a conversation, and leaves nothing to resume. The agent receives what that generation used instead: the frozen profile version, the generation settings, the opening's brief and fit check (or the library focus), the communication rules with the public names, the document's coverage review, and which profile passages each line traces to.

The document belongs to the user: they may write anything in it, and the agent writes what the profile supports plus what the user asks for in the conversation. StoryToRole points, it doesn't forbid:

- The agent changes the document only through **suggestions** shown in place (accept or reject, word-level diff), including when the user asked for the change: it never writes into the document directly; an accepted one becomes a new snapshot, authored by the AI and accepted by the user.
- The agent grounds a suggestion on the frozen profile version and on the user's own words in the conversation; it never invents. A figure must come from one of the two, as the profile agent's figure rule already enforces in code.
- Lines that don't trace to the profile version, whether the user typed them or accepted them from the agent, are **pointed out** as findings (“not in your profile”), with “Add to the profile” (a suggestion in the profile's draft, origin `document`) and Ignore. So are figures not marked `[medido]`, never-include terms and originals with a public name. Like the generation's warnings, they don't block the PDF: they ask for “Generate PDF anyway”.
- The user edits everything except the section titles, the header and a position's employer, title and dates included: a fact that then differs from the profile is pointed out (`lockedFact`), never refused. The agent suggests changing a locked fact only when the user asked for that change in the conversation, never on its own judgement; code enforces it.
- A line the user rewords keeps its trace (origin `edited`); only an untraced line is “not in your profile”.

## Consequences

- Credits are reserved and settled per message, priced like a profile agent message.
- The privacy notice already covers agent messages passing through Trigger.dev for up to 7 days; it names the document agent too.
- The profile agent and the document agent share the chat plumbing (sessions, recovery, new conversation, attachments, slash commands); only their context and tools differ.

## Addendum: the opening's user input

Both document agents (the resume's and the cover letter's) read what the user answered and chose for the opening, compactly and as the user's own statements, not verified facts: the gap answers (have or lack, their words, the positions and projects they tied them to) and the application instructions kept; for a cover letter also the chosen story, the motivation points kept and the company facts approved. They work independently; there is no opening-level agent (ADR 0010, withdrawn).
