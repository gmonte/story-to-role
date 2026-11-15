CREATE TABLE IF NOT EXISTS "position_title_equivalents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"positionId" uuid NOT NULL,
	"language" text NOT NULL,
	"encryptedTitle" text NOT NULL,
	"approvedAt" timestamp with time zone,
	CONSTRAINT "position_title_equivalents_language_unique" UNIQUE("positionId","language")
);
--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'generate' NOT NULL;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "sourceVersionId" uuid;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "sourceSnapshotId" uuid;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "sourceSnapshotSequence" integer;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "targetSnapshotId" uuid;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "encryptedSyncPlan" text;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "encryptedProposal" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "position_title_equivalents" ADD CONSTRAINT "position_title_equivalents_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "position_title_equivalents" ADD CONSTRAINT "position_title_equivalents_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "position_title_equivalents_profile_id_idx" ON "position_title_equivalents" USING btree ("profileId");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_sourceVersionId_document_versions_id_fk" FOREIGN KEY ("sourceVersionId") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "document_versions" DROP COLUMN IF EXISTS "syncBaseSnapshotId";