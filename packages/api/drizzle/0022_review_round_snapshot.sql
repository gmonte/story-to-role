ALTER TABLE "review_rounds" ADD COLUMN IF NOT EXISTS "snapshotId" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_rounds" ADD CONSTRAINT "review_rounds_snapshotId_document_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."document_snapshots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
