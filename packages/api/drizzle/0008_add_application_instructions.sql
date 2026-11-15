CREATE TABLE IF NOT EXISTS "application_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"encryptedText" text NOT NULL,
	"status" text DEFAULT 'splitting' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "instruction_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"instructionsId" uuid,
	"source" text NOT NULL,
	"fitCheckItemId" uuid,
	"sequence" integer NOT NULL,
	"encryptedText" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"suggestedPromotion" boolean DEFAULT false NOT NULL,
	"positionId" uuid,
	"credentialId" uuid,
	"evidenceKind" text,
	"encryptedSensitiveItems" text,
	"evidenceId" uuid,
	"confirmedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "locked_fact_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"positionId" uuid NOT NULL,
	"field" text NOT NULL,
	"encryptedValue" text NOT NULL,
	"pointId" uuid,
	"confirmedAt" timestamp with time zone,
	CONSTRAINT "locked_fact_overrides_field_unique" UNIQUE("openingId","positionId","field")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_instructions" ADD CONSTRAINT "application_instructions_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_instructions" ADD CONSTRAINT "application_instructions_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instruction_points" ADD CONSTRAINT "instruction_points_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instruction_points" ADD CONSTRAINT "instruction_points_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instruction_points" ADD CONSTRAINT "instruction_points_instructionsId_application_instructions_id_fk" FOREIGN KEY ("instructionsId") REFERENCES "public"."application_instructions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instruction_points" ADD CONSTRAINT "instruction_points_fitCheckItemId_fit_check_items_id_fk" FOREIGN KEY ("fitCheckItemId") REFERENCES "public"."fit_check_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instruction_points" ADD CONSTRAINT "instruction_points_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instruction_points" ADD CONSTRAINT "instruction_points_credentialId_credentials_id_fk" FOREIGN KEY ("credentialId") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instruction_points" ADD CONSTRAINT "instruction_points_evidenceId_evidence_id_fk" FOREIGN KEY ("evidenceId") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "locked_fact_overrides" ADD CONSTRAINT "locked_fact_overrides_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "locked_fact_overrides" ADD CONSTRAINT "locked_fact_overrides_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "locked_fact_overrides" ADD CONSTRAINT "locked_fact_overrides_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "locked_fact_overrides" ADD CONSTRAINT "locked_fact_overrides_pointId_instruction_points_id_fk" FOREIGN KEY ("pointId") REFERENCES "public"."instruction_points"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_instructions_opening_id_idx" ON "application_instructions" USING btree ("openingId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "instruction_points_opening_id_idx" ON "instruction_points" USING btree ("openingId");