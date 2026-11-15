CREATE TABLE IF NOT EXISTS "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"status" text DEFAULT 'in_preparation' NOT NULL,
	"tone" text DEFAULT 'your_style' NOT NULL,
	"sectionsForcedIn" text[] DEFAULT '{}'::text[] NOT NULL,
	"sectionsForcedOut" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "applications_opening_id_unique" UNIQUE("openingId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"versionId" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"parentSnapshotId" uuid,
	"origin" text NOT NULL,
	"author" text NOT NULL,
	"encryptedContent" text NOT NULL,
	"generationId" uuid,
	CONSTRAINT "document_snapshots_version_sequence_unique" UNIQUE("versionId","sequence")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"documentId" uuid NOT NULL,
	"language" text NOT NULL,
	"encryptedLabel" text,
	"adaptedFromVersionId" uuid,
	"syncBaseSnapshotId" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"applicationId" uuid,
	"kind" text NOT NULL,
	"encryptedFocus" text,
	CONSTRAINT "documents_application_kind_unique" UNIQUE("applicationId","kind")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"documentId" uuid NOT NULL,
	"versionId" uuid,
	"language" text NOT NULL,
	"reviewDepth" text NOT NULL,
	"writingLevel" text NOT NULL,
	"tone" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"bestRound" integer,
	"snapshotId" uuid,
	"finishedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"generationId" uuid NOT NULL,
	"round" integer NOT NULL,
	"rating" integer NOT NULL,
	"inputTokens" integer NOT NULL,
	"outputTokens" integer NOT NULL,
	"kept" boolean DEFAULT false NOT NULL,
	"encryptedReview" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resume_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"sections" jsonb NOT NULL,
	"encryptedHeader" text,
	CONSTRAINT "resume_templates_profile_id_unique" UNIQUE("profileId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "style_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"encryptedSamples" text NOT NULL,
	"encryptedProfile" text,
	"approvedAt" timestamp with time zone,
	CONSTRAINT "style_profiles_profile_id_unique" UNIQUE("profileId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_snapshots" ADD CONSTRAINT "document_snapshots_versionId_document_versions_id_fk" FOREIGN KEY ("versionId") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_versionId_document_versions_id_fk" FOREIGN KEY ("versionId") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_rounds" ADD CONSTRAINT "review_rounds_generationId_generations_id_fk" FOREIGN KEY ("generationId") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resume_templates" ADD CONSTRAINT "resume_templates_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_profile_id_idx" ON "applications" USING btree ("profileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_versions_document_id_idx" ON "document_versions" USING btree ("documentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_profile_id_idx" ON "documents" USING btree ("profileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generations_document_id_idx" ON "generations" USING btree ("documentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_rounds_generation_id_idx" ON "review_rounds" USING btree ("generationId");