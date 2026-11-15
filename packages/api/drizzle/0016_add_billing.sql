CREATE TABLE IF NOT EXISTS "billing_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" uuid NOT NULL,
	"stripeCustomerId" text NOT NULL,
	CONSTRAINT "billing_customers_user_id_unique" UNIQUE("userId"),
	CONSTRAINT "billing_customers_stripe_customer_id_unique" UNIQUE("stripeCustomerId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"userId" uuid NOT NULL,
	"stripeSubscriptionId" text NOT NULL,
	"status" text NOT NULL,
	"interval" text NOT NULL,
	"currentPeriodStart" timestamp with time zone NOT NULL,
	"currentPeriodEnd" timestamp with time zone NOT NULL,
	"cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
	"paidInvoiceId" text,
	"paidPeriodStart" timestamp with time zone,
	"paidPeriodEnd" timestamp with time zone,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripeSubscriptionId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_user_id_idx" ON "subscriptions" USING btree ("userId");