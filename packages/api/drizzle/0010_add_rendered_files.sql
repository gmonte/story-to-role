CREATE TABLE IF NOT EXISTS "rendered_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"snapshotId" uuid NOT NULL,
	"template" text NOT NULL,
	"storageKey" text NOT NULL,
	"pages" integer NOT NULL,
	CONSTRAINT "rendered_files_snapshot_template_unique" UNIQUE("snapshotId","template")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rendered_files" ADD CONSTRAINT "rendered_files_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rendered_files" ADD CONSTRAINT "rendered_files_snapshotId_document_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."document_snapshots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;