ALTER TABLE "fit_checks" ADD COLUMN IF NOT EXISTS "profileVersionId" uuid;--> statement-breakpoint
ALTER TABLE "fit_checks" ADD COLUMN IF NOT EXISTS "preferencesVersionId" uuid;--> statement-breakpoint
ALTER TABLE "fit_checks" ADD COLUMN IF NOT EXISTS "encryptedPreferenceConflicts" text;--> statement-breakpoint
ALTER TABLE "opening_terms" ADD COLUMN IF NOT EXISTS "importance" text DEFAULT 'mandatory' NOT NULL;--> statement-breakpoint
ALTER TABLE "openings" ADD COLUMN IF NOT EXISTS "warnings" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fit_checks" ADD CONSTRAINT "fit_checks_profileVersionId_profile_versions_id_fk" FOREIGN KEY ("profileVersionId") REFERENCES "public"."profile_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fit_checks" ADD CONSTRAINT "fit_checks_preferencesVersionId_profile_versions_id_fk" FOREIGN KEY ("preferencesVersionId") REFERENCES "public"."profile_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;