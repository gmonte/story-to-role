# A position's account is its source of truth, not a set of facts

Status: proposed, for the owner's review.

The guided interview turned each position into loose facts (achievements, responsibilities, metrics, tools), approved one by one, and generation built every resume line from them. In the walkthrough this read as bookkeeping: the user approved dozens of fragments, the same fact came twice from two files, and nowhere could they read what they had told about a position as a whole. The owner's own way of working, a `profile_truth.md` written as prose per position, was the model they wanted.

So each position now has an **account**: a text in the user's voice telling what they did there, versioned, approved as a whole. It is the source of truth for that position. The interviewer's job is to enrich it: it interviews the user about the position and proposes a richer version (more concrete actions, scale, results, numbers), which the user approves or edits. There is no right or wrong account, only one richer in information worth extracting.

What is derived from the account, and when:

- **Skills** are extracted from the approved account whenever a new version is approved, as an index the fit check and the library search read.
- **Resume bullets are not stored.** They are written when a document is generated, from the accounts, chosen and phrased for that document's focus: a general resume takes each position's strongest points; a resume focused on React Native draws the mobile achievements.

ADR 0001 holds unchanged, with a new source: the AI may only use approved accounts, application instructions and approved company facts. A generated line must be backed by an approved account, and every figure in it must appear in that account; code checks it, as it checks figures against evidence today.

## Consequences

- Fact-by-fact review, the folding of repeated facts across files and the evidence kinds leave the interview. Importing a file proposes a draft account per position (merging what each file says), approved like any new version.
- Locked facts (employer, title, dates), credentials and sensitive items stay as they are; sensitive items are flagged in the account and applied in code to everything generated from it.
- Existing evidence, stories and interview turns seed the first draft account of each position, for the user to approve; nothing already approved is lost.
- The fit check, resume and cover letter generation read accounts instead of evidence: their specs change with this one.
- The trace of a generated line points to the passage of the account version it came from.
