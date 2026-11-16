-- Profiles that went through the privacy notice picked their interview
-- language there: count it as the user's choice. Re-runnable: it only fills
-- profiles with no source yet.
UPDATE "career_profiles" SET "interviewLanguageSource" = 'user' WHERE "interviewLanguageSource" IS NULL AND "privacyNoticeAcceptedAt" IS NOT NULL;
