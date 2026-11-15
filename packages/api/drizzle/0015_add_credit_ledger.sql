CREATE TABLE IF NOT EXISTS "courtesy_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" uuid NOT NULL,
	"monthlyCredits" integer NOT NULL,
	"endsAt" timestamp with time zone,
	"endedAt" timestamp with time zone,
	"grantedBy" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" uuid NOT NULL,
	"lotId" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"taskId" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" uuid NOT NULL,
	"source" text NOT NULL,
	"scope" text DEFAULT 'any' NOT NULL,
	"amount" integer NOT NULL,
	"expiresAt" timestamp with time zone,
	"origin" text NOT NULL,
	CONSTRAINT "credit_lots_origin_unique" UNIQUE("origin")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "courtesy_grants" ADD CONSTRAINT "courtesy_grants_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "courtesy_grants" ADD CONSTRAINT "courtesy_grants_grantedBy_users_id_fk" FOREIGN KEY ("grantedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_lotId_credit_lots_id_fk" FOREIGN KEY ("lotId") REFERENCES "public"."credit_lots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_taskId_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courtesy_grants_user_id_idx" ON "courtesy_grants" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_entries_user_id_idx" ON "credit_entries" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_entries_lot_id_idx" ON "credit_entries" USING btree ("lotId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_entries_task_id_idx" ON "credit_entries" USING btree ("taskId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_lots_user_id_idx" ON "credit_lots" USING btree ("userId");