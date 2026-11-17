# StoryToRole

StoryToRole helps job seekers produce tailored resumes and cover letters from a career evidence base the user has approved. Nothing is invented.

## Career

**Credential**:
An education, certification, language, course, publication, award or volunteering entry; a short locked fact that can also own evidence and stories.
_Avoid_: Qualification, certificate, diploma

**Locked fact**:
An employer, title or date of a position that code prevents the AI from altering in any generated text.
_Avoid_: Fixed field, protected field

**Position**:
A role the user holds or has held at one employer, with a title and a period; the unit the guided interview works through one at a time.
_Avoid_: Job, experience, role

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
A quick analysis, run automatically when an opening is added and shown as a hint, of whether the opening makes sense for the user's skills.
_Avoid_: Fit score, match, assessment

**Review round**:
One review and edit pass over a generated document during generation; the user picks how many rounds to allow.
_Avoid_: Iteration, revision, pass

**ATS check**:
A literal comparison of a generated resume against an opening's keywords, as an applicant tracking system would read it.
_Avoid_: ATS score, keyword score, match rate

**Application instructions**:
Free-text statements the user adds for one application's generation only; each point may be promoted to the global evidence base.
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
A different employer, title or dates for one position that the user declares for a single application, which code then enforces there.
_Avoid_: Exception, custom title

**Adaptation**:
A snapshot that rewrites a generated document in another output language from the latest snapshot of another version, keeping its evidence and adding no new fact.
_Avoid_: Translation, localization

**Company fact**:
A fact about a company found by web research for one application, kept with its source and used only once the user approves it.
_Avoid_: Company data, insight

**Career goal**:
What the user wants from their next role, stated in a motivation interview and approved into the evidence base.
_Avoid_: Preference, objective, wish

**Motivation interview**:
The short conversation, within an application, about why the user wants that opening.
_Avoid_: Cover letter interview, questionnaire

## Guided interview

**Account** (proposed, see ADR 0008):
A position's own text in the user's voice, telling what they did there; versioned and approved as a whole, the source every document is generated from. In Portuguese, "relato".
_Avoid_: Profile, summary (a summary is the AI's reading of it), story (a problem-action-result record)

**Truth file**:
A document the user already keeps with their own career facts, imported as a source document and validated like any extraction.
_Avoid_: Profile file, about me, bio

**Interview**:
The guided conversation in which StoryToRole discovers the user's career story, position by position, and turns it into approved evidence.
_Avoid_: Onboarding chat, questionnaire; never use it for an employer's interview (see Hiring interview)

**Hiring interview**:
An interview an employer holds with the user during an application; StoryToRole does not prepare users for it in the MVP.
_Avoid_: Interview (unqualified), interview prep

**Interface language**:
The language the app's screens are shown in, set independently of every other language.
_Avoid_: Locale, app language

**Interview language**:
The language the user and the interviewer converse in; each evidence item keeps the interview language it was told in.
_Avoid_: Chat language, AI language

**Depth**:
How complete a position's story is in the evidence base, shown beside its workflow status.
_Avoid_: Status, progress, score

**Short script**:
A reduced interview script that covers only a position's highlights, used for old or off-target positions and in the Free plan.
_Avoid_: Quick interview, light mode

**Session**:
One slice of the guided interview about a single position (or one project of it), whose turns are never loaded again once it closes.
_Avoid_: Conversation, chat, thread

**Session checkpoint**:
The moment a session that has grown too long is closed: what was said so far is extracted, the user approves it, and the interview continues in a fresh session.
_Avoid_: Compaction, summary, context reset

## Sensitive data

**Sensitive item**:
A client name, project codename, explicit figure or person mentioned in the evidence base that the user may not want in generated text.
_Avoid_: Secret, PII, confidential data

**Sensitivity choice**:
The user's general rule for one sensitive item (use, generalize or exclude), applied to every application unless overridden.
_Avoid_: Privacy setting, visibility

**Application override**:
An exception to a sensitivity choice that applies to a single application only.
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
