CREATE TABLE IF NOT EXISTS "user_data_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" uuid NOT NULL,
	"wrappedKey" text NOT NULL,
	"masterKeyVersion" integer NOT NULL,
	CONSTRAINT "user_data_keys_user_id_unique" UNIQUE("userId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_data_keys" ADD CONSTRAINT "user_data_keys_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
