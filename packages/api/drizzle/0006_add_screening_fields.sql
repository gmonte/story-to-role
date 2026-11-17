ALTER TABLE "fit_checks" ADD COLUMN IF NOT EXISTS "profileVersionId" uuid;--> statement-breakpoint
ALTER TABLE "fit_checks" ADD COLUMN IF NOT EXISTS "encryptedPreferenceConflicts" text;--> statement-breakpoint
ALTER TABLE "fit_checks" ADD COLUMN IF NOT EXISTS "warnings" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "opening_terms" ADD COLUMN IF NOT EXISTS "importance" text DEFAULT 'mandatory' NOT NULL;