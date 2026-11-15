CREATE TABLE IF NOT EXISTS "company_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"researchId" uuid,
	"encryptedText" text NOT NULL,
	"encryptedSourceUrl" text NOT NULL,
	"encryptedSourceTitle" text NOT NULL,
	"approvedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_research" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"status" text DEFAULT 'researching' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_facts" ADD CONSTRAINT "company_facts_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_facts" ADD CONSTRAINT "company_facts_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_facts" ADD CONSTRAINT "company_facts_researchId_company_research_id_fk" FOREIGN KEY ("researchId") REFERENCES "public"."company_research"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_research" ADD CONSTRAINT "company_research_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_research" ADD CONSTRAINT "company_research_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_facts_opening_id_idx" ON "company_facts" USING btree ("openingId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_research_opening_id_idx" ON "company_research" USING btree ("openingId");