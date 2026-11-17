CREATE TABLE IF NOT EXISTS "coverage_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"generationId" uuid NOT NULL,
	"snapshotId" uuid NOT NULL,
	"profileVersionId" uuid,
	"encryptedContent" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coverage_reviews" ADD CONSTRAINT "coverage_reviews_generationId_generations_id_fk" FOREIGN KEY ("generationId") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coverage_reviews" ADD CONSTRAINT "coverage_reviews_snapshotId_document_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."document_snapshots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coverage_reviews" ADD CONSTRAINT "coverage_reviews_profileVersionId_profile_versions_id_fk" FOREIGN KEY ("profileVersionId") REFERENCES "public"."profile_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coverage_reviews_snapshot_id_idx" ON "coverage_reviews" USING btree ("snapshotId");
