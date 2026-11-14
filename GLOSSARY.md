# StoryToRole

StoryToRole helps job seekers produce tailored resumes and cover letters from a career evidence base the user has approved. Nothing is invented.

## Career

**Position**:
A role the user holds or has held at one employer, with a title and a period; the unit the guided interview works through one at a time.
_Avoid_: Job, experience, role

## Openings and applications

**Opening**:
A job vacancy at a company, described by the text the user pastes; it is open or closed regardless of what the user does.
_Avoid_: Job, vacancy, role, posting

**Application**:
The user's pursuit of one opening, which starts when a resume is first generated for it and ends hired, rejected or withdrawn.
_Avoid_: Candidacy, job, tracker entry

**Output language**:
The language a generated resume or cover letter is written in, chosen by the user for each generation.
_Avoid_: Target language, resume language

**Adaptation**:
A version of a generated document rewritten in another output language from an existing version, keeping its evidence and adding no new fact.
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

**Usage allowance**:
The monthly amount of AI usage a plan includes; it limits only usage paid by StoryToRole and is shown as information when the user brings their own key.
_Avoid_: Budget, quota, credits
