CREATE TABLE IF NOT EXISTS "application_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"sensitiveItemId" uuid NOT NULL,
	"choice" text NOT NULL,
	"encryptedGeneralized" text,
	CONSTRAINT "application_overrides_opening_item_unique" UNIQUE("openingId","sensitiveItemId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_overrides" ADD CONSTRAINT "application_overrides_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_overrides" ADD CONSTRAINT "application_overrides_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_overrides" ADD CONSTRAINT "application_overrides_sensitiveItemId_sensitive_items_id_fk" FOREIGN KEY ("sensitiveItemId") REFERENCES "public"."sensitive_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_overrides_opening_id_idx" ON "application_overrides" USING btree ("openingId");