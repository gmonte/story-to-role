-- pgvector stores the local embeddings (ADR 0004).
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fit_check_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"fitCheckId" uuid NOT NULL,
	"termId" uuid NOT NULL,
	"verdict" text NOT NULL,
	"encryptedExplanation" text NOT NULL,
	"evidenceIds" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"encryptedGapQuestion" text,
	"encryptedGapAnswer" text,
	"answeredAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fit_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"openingId" uuid NOT NULL,
	"band" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opening_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"openingId" uuid NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"encryptedText" text NOT NULL,
	"embedding" vector(384)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"encryptedCompany" text,
	"encryptedTitle" text,
	"encryptedDescription" text,
	"encryptedNotes" text,
	"encryptedSourceUrl" text,
	"rejectionReason" text,
	"language" text,
	"suggestedTone" text,
	"embedding" vector(384),
	"closedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN IF NOT EXISTS "embedding" vector(384);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fit_check_items" ADD CONSTRAINT "fit_check_items_fitCheckId_fit_checks_id_fk" FOREIGN KEY ("fitCheckId") REFERENCES "public"."fit_checks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fit_check_items" ADD CONSTRAINT "fit_check_items_termId_opening_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."opening_terms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fit_checks" ADD CONSTRAINT "fit_checks_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opening_terms" ADD CONSTRAINT "opening_terms_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "openings" ADD CONSTRAINT "openings_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fit_check_items_fit_check_id_idx" ON "fit_check_items" USING btree ("fitCheckId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fit_checks_opening_id_idx" ON "fit_checks" USING btree ("openingId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opening_terms_opening_id_idx" ON "opening_terms" USING btree ("openingId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "openings_profile_id_idx" ON "openings" USING btree ("profileId");
