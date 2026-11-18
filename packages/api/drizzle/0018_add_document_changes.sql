CREATE TABLE IF NOT EXISTS "document_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"versionId" uuid NOT NULL,
	"snapshotId" uuid,
	"origin" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"encryptedContent" text NOT NULL,
	"resolvedAt" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_changes" ADD CONSTRAINT "document_changes_versionId_document_versions_id_fk" FOREIGN KEY ("versionId") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_changes" ADD CONSTRAINT "document_changes_snapshotId_document_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."document_snapshots"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_changes_version_status_idx" ON "document_changes" USING btree ("versionId","status");
