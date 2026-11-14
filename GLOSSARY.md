# StoryToRole

StoryToRole helps job seekers produce tailored resumes and cover letters from a career evidence base the user has approved. Nothing is invented.

## Career

**Locked fact**:
An employer, title or date of a position that code prevents the AI from altering in any generated text.
_Avoid_: Fixed field, protected field

**Position**:
A role the user holds or has held at one employer, with a title and a period; the unit the guided interview works through one at a time.
_Avoid_: Job, experience, role

## Openings and applications

**Opening**:
A target the user may apply to at one company: a posted vacancy, or a company the user wants to approach even with no vacancy open.
_Avoid_: Job, vacancy, role, posting, target

**Application**:
The user's pursuit of one opening, which starts when its first document is generated or copied and ends hired, rejected or withdrawn.
_Avoid_: Candidacy, job, tracker entry

**Fit check**:
A quick analysis, run automatically when an opening is added and shown as a hint, of whether the opening makes sense for the user's skills.
_Avoid_: Fit score, match, assessment

**ATS check**:
A literal comparison of a generated resume against an opening's keywords, as an applicant tracking system would read it.
_Avoid_: ATS score, keyword score, match rate

**Application instructions**:
Free-text statements the user adds for one application's generation only; each point may be promoted to the global evidence base.
_Avoid_: Extra prompt, custom prompt, notes

**Outdated**:
The state of a document whose source changed after it was produced: a language version behind another language version, or a cover letter whose resume got a new snapshot.
_Avoid_: Stale, out of sync, dirty

**Output language**:
The language a generated resume or cover letter is written in, chosen by the user for each generation.
_Avoid_: Target language, resume language

**Document**:
A resume or a cover letter belonging to one application; an application has at most one of each.
_Avoid_: Artifact, file, output

**Language version**:
The line of snapshots of one document in one output language; a document has at most one per language, and its latest snapshot is the official one.
_Avoid_: Branch, translation, variant

**Snapshot**:
An immutable copy of a generated document's content at one point in its language version's history.
_Avoid_: Commit, version, revision, draft; the interface calls it a change

**Submission freeze**:
The point at which an application is marked as applied and all of its documents become read-only.
_Avoid_: Lock, finalization

**Language sync**:
Carrying the changes of one language version into another language version of the same document, preserving the target's own edits.
_Avoid_: Translation update, merge

**Locked-fact override**:
A different employer, title or dates for one position that the user declares for a single application, which code then enforces there.
_Avoid_: Exception, custom title

**Adaptation**:
A snapshot that rewrites a generated document in another output language from the latest snapshot of another language version, keeping its evidence and adding no new fact.
_Avoid_: Translation, localization

## Guided interview

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

## Plans and usage

**Credit**:
The unit every AI action is paid in; plans and packs grant credits, and each action costs a known number of them.
_Avoid_: Token, point, coin

**Credit reserve**:
Credits held back for the step the user came for, so that earlier steps cannot consume them.
_Avoid_: Hold, buffer

**Usage allowance**:
The monthly amount of AI usage a plan includes; it limits only usage paid by StoryToRole and is shown as information when the user brings their own key.
_Avoid_: Budget, quota, credits
