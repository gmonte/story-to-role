CREATE TABLE IF NOT EXISTS "profile_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" uuid NOT NULL,
	"kind" text NOT NULL,
	"encryptedDraft" text NOT NULL,
	"draftUpdatedAt" timestamp with time zone NOT NULL,
	"draftRevision" integer DEFAULT 0 NOT NULL,
	"publishedVersionId" uuid,
	CONSTRAINT "profile_documents_user_kind_unique" UNIQUE("userId","kind")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documentId" uuid NOT NULL,
	"number" integer NOT NULL,
	"encryptedMarkdown" text NOT NULL,
	"publishedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"validatedAt" timestamp with time zone,
	CONSTRAINT "profile_versions_document_number_unique" UNIQUE("documentId","number")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_documents" ADD CONSTRAINT "profile_documents_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_versions" ADD CONSTRAINT "profile_versions_documentId_profile_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."profile_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_versions_document_id_idx" ON "profile_versions" USING btree ("documentId");