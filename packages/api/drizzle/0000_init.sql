CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"deletedAt" timestamp with time zone,
	"clerkUserId" text NOT NULL,
	"email" text NOT NULL,
	"firstName" text NOT NULL,
	"lastName" text NOT NULL,
	"fullName" text NOT NULL,
	"imageUrl" text,
	"username" text,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerkUserId")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_full_name_idx" ON "users" USING btree ("fullName");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");