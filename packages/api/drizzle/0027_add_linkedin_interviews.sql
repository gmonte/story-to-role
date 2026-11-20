CREATE TABLE IF NOT EXISTS "linkedin_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"documentId" uuid NOT NULL,
	"section" text NOT NULL,
	"positionId" uuid,
	"projectId" uuid,
	"credentialId" uuid,
	"encryptedText" text NOT NULL,
	"status" text DEFAULT 'kept' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linkedin_interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"documentId" uuid NOT NULL,
	"section" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	CONSTRAINT "linkedin_interviews_section_unique" UNIQUE("documentId","section")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linkedin_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"interviewId" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"role" text NOT NULL,
	"encryptedText" text NOT NULL,
	CONSTRAINT "linkedin_turns_sequence_unique" UNIQUE("interviewId","sequence")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "linkedin_instructions" ADD CONSTRAINT "linkedin_instructions_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "linkedin_instructions" ADD CONSTRAINT "linkedin_instructions_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "linkedin_interviews" ADD CONSTRAINT "linkedin_interviews_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "linkedin_interviews" ADD CONSTRAINT "linkedin_interviews_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "linkedin_turns" ADD CONSTRAINT "linkedin_turns_interviewId_linkedin_interviews_id_fk" FOREIGN KEY ("interviewId") REFERENCES "public"."linkedin_interviews"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linkedin_instructions_document_idx" ON "linkedin_instructions" USING btree ("documentId");