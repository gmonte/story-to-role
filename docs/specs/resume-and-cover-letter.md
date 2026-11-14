# StoryToRole spec: Resume and cover letter generation

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Goal and scope

For one opening, StoryToRole generates a tailored resume and cover letter using only the approved evidence base (see [guided-interview.md](./guided-interview.md)). Generating the first resume for an opening starts an application.

Hiring interview prep is out of the MVP.

## Output language

- The user picks the output language before generating. It is preselected from the language detected in the opening description.
- After generating, the user can ask for the same document in another output language at any time. Every version is kept.

## Adaptations

A new version in another output language is an **adaptation** of an existing version, not a literal translation and not a fresh generation.

- It keeps the same evidence selection and the same evidence trace for every line.
- It rewrites wording for a native reader of that language and market: idiomatic action verbs, section names, date and number formats, and the opening's keywords in that language. Phrasing that does not work in the target language is reworked rather than translated word for word.
- It adds no new fact and never converts figures (no currency conversion, which would invent an exchange rate).
- The same code checks as any generation apply: locked facts and forbidden terms.
- Generating again from the evidence in the new language remains available as a separate action.

## Open points

- What counts as a version (generations, adaptations, manual edits) and which one is current.
- Which output languages are offered.
- Where generated content and rendered files are stored.
- How locked facts such as job titles appear in another language.
