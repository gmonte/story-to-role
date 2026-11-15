ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "embedding" vector(384);--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "embeddedSnapshotId" uuid;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "referenceSnapshotId" uuid;