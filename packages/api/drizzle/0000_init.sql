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
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"deletedAt" timestamp with time zone,
	"clerkOrganizationId" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"imageUrl" text,
	CONSTRAINT "organizations_clerk_organization_id_unique" UNIQUE("clerkOrganizationId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"deletedAt" timestamp with time zone,
	"clerkMembershipId" text NOT NULL,
	"userId" uuid NOT NULL,
	"organizationId" uuid NOT NULL,
	"clerkRole" text NOT NULL,
	CONSTRAINT "organization_memberships_clerk_id_unique" UNIQUE("clerkMembershipId"),
	CONSTRAINT "organization_memberships_user_org_unique" UNIQUE("userId","organizationId")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_full_name_idx" ON "users" USING btree ("fullName");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_name_idx" ON "organizations" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_memberships_user_id_idx" ON "organization_memberships" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_memberships_organization_id_idx" ON "organization_memberships" USING btree ("organizationId");