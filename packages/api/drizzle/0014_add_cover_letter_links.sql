ALTER TABLE "document_snapshots" ADD COLUMN IF NOT EXISTS "resumeVersionId" uuid;--> statement-breakpoint
ALTER TABLE "document_snapshots" ADD COLUMN IF NOT EXISTS "resumeSnapshotId" uuid;--> statement-breakpoint
ALTER TABLE "document_snapshots" ADD COLUMN IF NOT EXISTS "motivationSkipped" boolean;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "dismissedResumeSnapshotId" uuid;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "resumeVersionId" uuid;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "resumeSnapshotId" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_resumeVersionId_document_versions_id_fk" FOREIGN KEY ("resumeVersionId") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;