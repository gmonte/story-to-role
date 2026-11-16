CREATE TABLE IF NOT EXISTS "career_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"kind" text NOT NULL,
	"encryptedSummary" text NOT NULL,
	"reactive" boolean DEFAULT false NOT NULL,
	"seenAt" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "career_events" ADD CONSTRAINT "career_events_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_events_profile_id_idx" ON "career_events" USING btree ("profileId");