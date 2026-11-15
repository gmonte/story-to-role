CREATE TABLE IF NOT EXISTS "career_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"encryptedText" text NOT NULL,
	"language" text NOT NULL,
	"sourcePointId" uuid,
	"approvedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "motivation_interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"storyId" uuid,
	CONSTRAINT "motivation_interviews_opening_unique" UNIQUE("openingId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "motivation_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"interviewId" uuid NOT NULL,
	"kind" text NOT NULL,
	"encryptedText" text NOT NULL,
	"suggested" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "motivation_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"interviewId" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"role" text NOT NULL,
	"encryptedText" text NOT NULL,
	"aboutStory" boolean DEFAULT false NOT NULL,
	CONSTRAINT "motivation_turns_sequence_unique" UNIQUE("interviewId","sequence")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "career_goals" ADD CONSTRAINT "career_goals_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "motivation_interviews" ADD CONSTRAINT "motivation_interviews_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "motivation_interviews" ADD CONSTRAINT "motivation_interviews_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "motivation_interviews" ADD CONSTRAINT "motivation_interviews_storyId_stories_id_fk" FOREIGN KEY ("storyId") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "motivation_points" ADD CONSTRAINT "motivation_points_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "motivation_points" ADD CONSTRAINT "motivation_points_interviewId_motivation_interviews_id_fk" FOREIGN KEY ("interviewId") REFERENCES "public"."motivation_interviews"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "motivation_turns" ADD CONSTRAINT "motivation_turns_interviewId_motivation_interviews_id_fk" FOREIGN KEY ("interviewId") REFERENCES "public"."motivation_interviews"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_goals_profile_id_idx" ON "career_goals" USING btree ("profileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "motivation_points_interview_id_idx" ON "motivation_points" USING btree ("interviewId");