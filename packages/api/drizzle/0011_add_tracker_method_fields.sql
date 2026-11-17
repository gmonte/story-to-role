ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "encryptedSourceDetail" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "applicationType" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "pickedResumeVersionId" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "encryptedNextStep" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "encryptedNotes" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "encryptedDeclineReason" text;