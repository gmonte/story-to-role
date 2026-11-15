CREATE TABLE IF NOT EXISTS "ai_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" uuid NOT NULL,
	"provider" text NOT NULL,
	"encryptedKey" text NOT NULL,
	"lastCharacters" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"statusChangedAt" timestamp with time zone,
	CONSTRAINT "ai_keys_user_id_provider_unique" UNIQUE("userId","provider")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stored_credit_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"confirmedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" uuid NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	CONSTRAINT "stored_credit_confirmations_user_id_unique" UNIQUE("userId")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "funding" text DEFAULT 'credits' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_keys" ADD CONSTRAINT "ai_keys_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stored_credit_confirmations" ADD CONSTRAINT "stored_credit_confirmations_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;