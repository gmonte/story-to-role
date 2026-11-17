CREATE TABLE IF NOT EXISTS "profile_extracts" (
	"versionId" uuid PRIMARY KEY NOT NULL,
	"encryptedContent" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_passages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"versionId" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"section" text,
	"experience" integer,
	"encryptedText" text NOT NULL,
	"embedding" vector(384)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"documentId" uuid NOT NULL,
	"draftRevision" integer NOT NULL,
	"baseVersionId" uuid,
	"status" text NOT NULL,
	"encryptedReport" text,
	"completedAt" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_extracts" ADD CONSTRAINT "profile_extracts_versionId_profile_versions_id_fk" FOREIGN KEY ("versionId") REFERENCES "public"."profile_versions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_passages" ADD CONSTRAINT "profile_passages_versionId_profile_versions_id_fk" FOREIGN KEY ("versionId") REFERENCES "public"."profile_versions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_validations" ADD CONSTRAINT "profile_validations_documentId_profile_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."profile_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_passages_version_id_idx" ON "profile_passages" USING btree ("versionId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_validations_document_id_idx" ON "profile_validations" USING btree ("documentId");