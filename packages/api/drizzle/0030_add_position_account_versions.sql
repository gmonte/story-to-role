CREATE TABLE IF NOT EXISTS "position_account_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"positionId" uuid NOT NULL,
	"version" integer,
	"encryptedText" text NOT NULL,
	"encryptedDoNotInclude" text NOT NULL,
	"source" text NOT NULL,
	"restoredFromId" uuid,
	"approvedAt" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "position_account_versions" ADD CONSTRAINT "position_account_versions_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "position_account_versions" ADD CONSTRAINT "position_account_versions_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "position_account_versions_position_id_idx" ON "position_account_versions" USING btree ("positionId");