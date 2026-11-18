# StoryToRole

StoryToRole helps job seekers produce tailored resumes and cover letters from one profile of their career, written and published by them, following the meu-emprego-novo method. Nothing is invented.

## Profile

**Profile**:
The user's whole career in one Markdown document, `profile_truth.md`, in the meu-emprego-novo method's template; the only source every document is generated from. In Portuguese, "perfil" (the file keeps its name).
_Avoid_: Evidence base, account, relato, career data

**Draft**:
The profile as the user is editing it, autosaved; never read by screening or generation.
_Avoid_: Working copy, unsaved changes

**Published version**:
A numbered, immutable version of the profile the user published; the latest one feeds screening and generation, and each generated document freezes the one it used.
_Avoid_: Official copy, release, snapshot (a snapshot belongs to a generated document)

**Validation**:
The AI quality review of what changed in the draft since the last published version, which the user asks for and pays for; its findings never block publishing.
_Avoid_: Approval, check, audit

**Linter**:
The deterministic check, plain code, that marks in the profile's text whatever breaks the template or its content rules.
_Avoid_: Validator, AI check

**Fix format**:
The linter's on-demand correction of what code can fix with certainty (titles, dates, marks, missing or misplaced sections).
_Avoid_: Auto-fix by AI, cleanup

**Figure mark**:
The bracketed origin after a figure in the profile: `[medido]`, `[estimado]`, `[sem número]` or `[a confirmar]`; only `[medido]` figures reach generated documents.
_Avoid_: Tag, label, confidence

**Suggestion**:
A change to the profile proposed by the agent, an import, a validation or an application, shown in place until the user accepts or rejects it.
_Avoid_: Draft fact, proposal, edit

**Profile agent**:
The AI the user talks to about a passage of their profile; it interviews per the method and changes the profile only through suggestions.
_Avoid_: Interviewer, career chat, orchestrator

**Document agent**:
The AI the user talks to about one generated document (a resume or a cover letter), with the profile version it froze in view; it changes the document only through suggestions, grounded on the profile and on what the user asks.
_Avoid_: Resume chat, editor assistant

**Experience**:
One position in the profile's Experience section, titled `### Company — Title (YYYY-MM to YYYY-MM)`, with context, responsibilities, tools, results and what the user did not do.
_Avoid_: Job, role, account

**Project**:
An entry of the profile's optional Projects section, titled `### Name (YYYY-MM to YYYY-MM)`: personal or side work that is not a position (a solo product, an open-source library), with an optional role, the experience's fields where they fit and an optional link; printed in a resume's Projects section right after the experiences, never as a job. In Portuguese, "projeto" (section "Projetos").
_Avoid_: Side gig, portfolio item, position

**Credential**:
An education, certification or language line of the profile, in the template's format.
_Avoid_: Qualification, certificate, diploma

**Locked fact**:
An employer, title or date of an experience that code prevents the AI from altering in any generated text.
_Avoid_: Fixed field, protected field

**Known gap**:
Something the user does not have or has not done, stated in the profile (in an experience's "what I did not do" or in Known gaps); it counts as a gap, never as coverage.
_Avoid_: Weakness, missing skill

**Communication rule**:
A line of the profile's Communication rules: something that must never appear ("never include") or never be claimed ("never claim") in what is generated; applied in code.
_Avoid_: Sensitive item, privacy setting, secret

**Job preferences**:
The user's separate document with work model, locations, salary range, excluded companies and sectors, and discard rules; read only by screening.
_Avoid_: Excluded jobs list, filters, settings

## Writing style

**Style profile**:
How the user writes, extracted from their own samples and approved by them, applied to every generation.
_Avoid_: Voice, persona, writing template

**Tone**:
A per-document adjustment on top of the style profile (formal, direct, warm, technical) that changes form, never facts.
_Avoid_: Style, mood

## Openings and applications

**Opening**:
A target the user may apply to at one company: a posted vacancy, or a company the user wants to approach even with no vacancy open.
_Avoid_: Job, vacancy, role, posting, target

**Application**:
The user's pursuit of one opening, which starts when its first document is generated or copied (or is registered by hand as an external application) and closes hired, rejected, withdrawn or with no response.
_Avoid_: Candidacy, job, tracker entry

**External application**:
An application the user made outside StoryToRole and registered by hand, with no documents and no credits spent; it stops being external once a document exists for it.
_Avoid_: Manual entry, imported application

**Event**:
A dated entry on an application's timeline ("HR interview on Nov 20"), recorded instead of adding statuses.
_Avoid_: Step, stage, activity

**Fit check**:
The method's screening, run automatically when an opening is added and shown as a hint: a high, medium or low band, each requirement backed by a profile passage or listed as a gap.
_Avoid_: Fit score, match, assessment

**Coverage review**:
The report that comes with every generated document, checked against the profile version it froze: code checks that point out and never block (the PDF asks for “Generate PDF anyway”), then strong and partial coverage, gaps not invented and inconsistencies.
_Avoid_: Quality report, score, audit

**Generation settings**:
The user's defaults for bullets per experience, what counts as recent or very old, and document length, shown as a prefilled form at each generation and enforced in code.
_Avoid_: Template, preferences

**Review round**:
One coverage review and edit pass over a generated document during generation; the user picks how many rounds to allow.
_Avoid_: Iteration, revision, pass

**ATS check**:
A literal comparison of a generated resume against an opening's keywords, as an applicant tracking system would read it.
_Avoid_: ATS score, keyword score, match rate

**Application instructions**:
Free-text statements the user adds for one application's generation only; each point may become a suggestion in the profile.
_Avoid_: Extra prompt, custom prompt, notes

**Outdated**:
The state of a document whose source changed after it was produced: a version behind another version of the same document, or a cover letter whose resume got a new snapshot.
_Avoid_: Stale, out of sync, dirty

**Output language**:
The language a generated resume or cover letter is written in, chosen by the user for each generation.
_Avoid_: Target language, resume language

**Document**:
A resume or a cover letter, either belonging to one application (at most one of each) or kept in the library.
_Avoid_: Artifact, file, output

**Version**:
The line of snapshots of one document in one output language; a document may hold several, even in the same language, and each version's latest snapshot is the official one.
_Avoid_: Branch, language version, variant, copy

**Library document**:
A resume or cover letter with no company behind it, kept in the library and titled by its required focus.
_Avoid_: General document, generic resume, master resume, template

**Snapshot**:
An immutable copy of a generated document's content at one point in its version's history.
_Avoid_: Commit, revision, draft; the interface calls it a change

**Language sync**:
Carrying the changes of one version into another version of the same document, preserving the target's own edits.
_Avoid_: Translation update, merge

**Locked-fact override**:
A different employer, title or dates for one experience that the user declares for a single application, which code then enforces there.
_Avoid_: Exception, custom title

**Adaptation**:
A snapshot that rewrites a generated document in another output language from the latest snapshot of another version, keeping its profile passages and adding no new fact.
_Avoid_: Translation, localization

**Company fact**:
A fact about a company found by web research for one application, kept with its source and used only once the user approves it.
_Avoid_: Company data, insight

**Career direction**:
What the user wants from their next role, kept in the profile under Professional identity; a motivation interview can suggest additions.
_Avoid_: Career goal, preference, objective, wish

**Motivation interview**:
The short conversation, within an application, about why the user wants that opening.
_Avoid_: Cover letter interview, questionnaire

## Sources and languages

**Truth file**:
A document the user already keeps with their own career facts, imported like a resume: its content and its "do not include" rules become suggestions in the profile.
_Avoid_: Profile file, about me, bio

**Hiring interview**:
An interview an employer holds with the user during an application; StoryToRole does not prepare users for it in the MVP.
_Avoid_: Interview (unqualified), interview prep

**Interface language**:
The language the app's screens are shown in, set independently of every other language.
_Avoid_: Locale, app language

**Application override**:
An exception to a communication rule that applies to a single application only.
_Avoid_: Per-job override, exception rule

## AI providers

**Provider package**:
A certified mapping of every AI role in the pipeline to one provider's models.
_Avoid_: Model list, preset, integration

## Plans and usage

**Plan**:
What a user is entitled to use: Free, the subscription, or the courtesy plan.
_Avoid_: Tier, package, BYOK plan

**AI funding**:
Who pays for a user's AI calls: StoryToRole credits or the user's own key from a certified provider.
_Avoid_: Billing mode, BYOK plan

**Courtesy plan**:
The paid plan granted by the owner to a user without a subscription.
_Avoid_: Free upgrade, comp, gift

**Credit**:
The unit every AI action is paid in; plans and packs grant credits, and each action costs a known number of them.
_Avoid_: Token, point, coin

**Credit reserve**:
Credits held back for the step the user came for, so that earlier steps cannot consume them.
_Avoid_: Hold, buffer

**Monthly credits**:
The credits a subscription grants each billing month, which expire at the end of that month.
_Avoid_: Usage allowance, quota, budget

**Welcome credits**:
Credits granted once to every new account, which never expire.
_Avoid_: Trial credits, bonus
