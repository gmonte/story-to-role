CREATE TABLE IF NOT EXISTS "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"applicationId" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurredAt" timestamp with time zone NOT NULL,
	"encryptedText" text,
	"fromStatus" text,
	"toStatus" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"applicationId" uuid NOT NULL,
	"versionId" uuid NOT NULL,
	"snapshotId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dismissed_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"reminderKey" text NOT NULL,
	CONSTRAINT "dismissed_reminders_profile_id_key_unique" UNIQUE("profileId","reminderKey")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracker_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"remindersEnabled" boolean DEFAULT true NOT NULL,
	"followUpDays" integer DEFAULT 10 NOT NULL,
	"noResponseDays" integer DEFAULT 30 NOT NULL,
	CONSTRAINT "tracker_settings_profile_id_unique" UNIQUE("profileId")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "external" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "statusChangedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "lastActivityAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "appliedAt" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_events" ADD CONSTRAINT "application_events_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_versionId_document_versions_id_fk" FOREIGN KEY ("versionId") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_snapshotId_document_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."document_snapshots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dismissed_reminders" ADD CONSTRAINT "dismissed_reminders_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tracker_settings" ADD CONSTRAINT "tracker_settings_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_events_application_id_idx" ON "application_events" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_submissions_application_id_idx" ON "application_submissions" USING btree ("applicationId");