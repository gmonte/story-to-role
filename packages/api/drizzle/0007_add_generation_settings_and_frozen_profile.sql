ALTER TABLE "instruction_points" DROP CONSTRAINT IF EXISTS "instruction_points_positionId_positions_id_fk";
--> statement-breakpoint
ALTER TABLE "instruction_points" DROP CONSTRAINT IF EXISTS "instruction_points_credentialId_credentials_id_fk";
--> statement-breakpoint
ALTER TABLE "locked_fact_overrides" DROP CONSTRAINT IF EXISTS "locked_fact_overrides_positionId_positions_id_fk";
--> statement-breakpoint
ALTER TABLE "position_title_equivalents" DROP CONSTRAINT IF EXISTS "position_title_equivalents_positionId_positions_id_fk";
--> statement-breakpoint
ALTER TABLE "document_snapshots" ADD COLUMN IF NOT EXISTS "profileVersionId" uuid;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "profileVersionId" uuid;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "settings" jsonb;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "encryptedEmphasis" text;--> statement-breakpoint
ALTER TABLE "resume_templates" ADD COLUMN IF NOT EXISTS "generationSettings" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_snapshots" ADD CONSTRAINT "document_snapshots_profileVersionId_profile_versions_id_fk" FOREIGN KEY ("profileVersionId") REFERENCES "public"."profile_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_profileVersionId_profile_versions_id_fk" FOREIGN KEY ("profileVersionId") REFERENCES "public"."profile_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;