-- pgvector stores the local embeddings (ADR 0004).
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "user_data_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" uuid NOT NULL,
	"wrappedKey" text NOT NULL,
	"masterKeyVersion" integer NOT NULL,
	CONSTRAINT "user_data_keys_user_id_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"userId" uuid NOT NULL,
	"type" text NOT NULL,
	"subjectId" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"runId" text,
	"progress" jsonb,
	"errorMessage" text,
	"funding" text DEFAULT 'credits' NOT NULL,
	"startedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" uuid NOT NULL,
	"taskId" uuid,
	"purpose" text NOT NULL,
	"funding" text NOT NULL,
	"provider" text NOT NULL,
	"role" text NOT NULL,
	"model" text NOT NULL,
	"inputTokens" integer NOT NULL,
	"outputTokens" integer NOT NULL,
	"cacheReadTokens" integer DEFAULT 0 NOT NULL,
	"cacheWriteTokens" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "stored_credit_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"confirmedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" uuid NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	CONSTRAINT "stored_credit_confirmations_user_id_unique" UNIQUE("userId")
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "career_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"userId" uuid NOT NULL,
	"interviewLanguage" text NOT NULL,
	"privacyNoticeAcceptedAt" timestamp with time zone,
	"startPath" text,
	CONSTRAINT "career_profiles_user_id_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"kind" text NOT NULL,
	"encryptedInstitution" text,
	"encryptedTitle" text NOT NULL,
	"level" text,
	"startDate" text,
	"endDate" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"sourceDocumentIds" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"approvedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"encryptedEmployer" text NOT NULL,
	"encryptedTitle" text NOT NULL,
	"encryptedLocation" text,
	"startDate" text,
	"endDate" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"origin" text NOT NULL,
	"sourceDocumentIds" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"approvedAt" timestamp with time zone,
	"removedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"kind" text NOT NULL,
	"encryptedFileName" text NOT NULL,
	"mimeType" text NOT NULL,
	"storageKey" text NOT NULL,
	"encryptedText" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "career_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"encryptedText" text NOT NULL,
	"language" text NOT NULL,
	"source" text NOT NULL,
	"sourcePointId" uuid,
	"approvedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sensitive_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"positionId" uuid,
	"kind" text NOT NULL,
	"encryptedOriginal" text NOT NULL,
	"encryptedContext" text,
	"choice" text,
	"encryptedGeneralized" text,
	"reviewedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fit_check_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"fitCheckId" uuid NOT NULL,
	"termId" uuid NOT NULL,
	"verdict" text NOT NULL,
	"encryptedExplanation" text NOT NULL,
	"evidenceIds" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"encryptedGapQuestion" text,
	"encryptedGapAnswer" text,
	"answeredAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fit_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"openingId" uuid NOT NULL,
	"band" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opening_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"openingId" uuid NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"encryptedText" text NOT NULL,
	"embedding" vector(384)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "openings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"encryptedCompany" text,
	"encryptedTitle" text,
	"encryptedDescription" text,
	"encryptedNotes" text,
	"encryptedSourceUrl" text,
	"rejectionReason" text,
	"language" text,
	"suggestedTone" text,
	"embedding" vector(384),
	"closedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"status" text DEFAULT 'in_preparation' NOT NULL,
	"tone" text DEFAULT 'your_style' NOT NULL,
	"external" boolean DEFAULT false NOT NULL,
	"statusChangedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"lastActivityAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"appliedAt" timestamp with time zone,
	"sectionsForcedIn" text[] DEFAULT '{}'::text[] NOT NULL,
	"sectionsForcedOut" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "applications_opening_id_unique" UNIQUE("openingId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"applicationId" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurredAt" timestamp with time zone NOT NULL,
	"encryptedText" text,
	"fromStatus" text,
	"toStatus" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"applicationId" uuid NOT NULL,
	"versionId" uuid NOT NULL,
	"snapshotId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dismissed_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"reminderKey" text NOT NULL,
	CONSTRAINT "dismissed_reminders_profile_id_key_unique" UNIQUE("profileId","reminderKey")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracker_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"remindersEnabled" boolean DEFAULT true NOT NULL,
	"followUpDays" integer DEFAULT 10 NOT NULL,
	"noResponseDays" integer DEFAULT 30 NOT NULL,
	CONSTRAINT "tracker_settings_profile_id_unique" UNIQUE("profileId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"encryptedText" text NOT NULL,
	"status" text DEFAULT 'splitting' NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "instruction_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"applicationInstructionsId" uuid,
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
	"instructionPointId" uuid,
	"confirmedAt" timestamp with time zone,
	CONSTRAINT "locked_fact_overrides_field_unique" UNIQUE("openingId","positionId","field")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"researchId" uuid,
	"encryptedText" text NOT NULL,
	"encryptedSourceUrl" text NOT NULL,
	"encryptedSourceTitle" text NOT NULL,
	"approvedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_research" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"status" text DEFAULT 'researching' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "motivation_interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"openingId" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	CONSTRAINT "motivation_interviews_opening_unique" UNIQUE("openingId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "motivation_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"interviewId" uuid NOT NULL,
	"kind" text NOT NULL,
	"encryptedText" text NOT NULL,
	"suggested" boolean DEFAULT false NOT NULL,
	"encryptedSensitiveItems" text,
	"status" text DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "motivation_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"interviewId" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"role" text NOT NULL,
	"encryptedText" text NOT NULL,
	"aboutStory" boolean DEFAULT false NOT NULL,
	CONSTRAINT "motivation_turns_sequence_unique" UNIQUE("interviewId","sequence")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"versionId" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"parentSnapshotId" uuid,
	"origin" text NOT NULL,
	"author" text NOT NULL,
	"encryptedContent" text NOT NULL,
	"generationId" uuid,
	"resumeVersionId" uuid,
	"resumeSnapshotId" uuid,
	"motivationSkipped" boolean,
	CONSTRAINT "document_snapshots_version_sequence_unique" UNIQUE("versionId","sequence")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"documentId" uuid NOT NULL,
	"language" text NOT NULL,
	"encryptedLabel" text,
	"adaptedFromVersionId" uuid,
	"embedding" vector(384),
	"embeddedSnapshotId" uuid,
	"dismissedResumeSnapshotId" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"applicationId" uuid,
	"kind" text NOT NULL,
	"encryptedFocus" text,
	CONSTRAINT "documents_application_kind_unique" UNIQUE("applicationId","kind")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"documentId" uuid NOT NULL,
	"versionId" uuid,
	"kind" text DEFAULT 'generate' NOT NULL,
	"language" text NOT NULL,
	"sourceVersionId" uuid,
	"sourceSnapshotId" uuid,
	"sourceSnapshotSequence" integer,
	"targetSnapshotId" uuid,
	"referenceSnapshotId" uuid,
	"resumeVersionId" uuid,
	"resumeSnapshotId" uuid,
	"encryptedSyncPlan" text,
	"encryptedProposal" text,
	"reviewDepth" text NOT NULL,
	"writingLevel" text NOT NULL,
	"tone" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"bestRound" integer,
	"snapshotId" uuid,
	"finishedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "position_title_equivalents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"positionId" uuid NOT NULL,
	"language" text NOT NULL,
	"encryptedTitle" text NOT NULL,
	"approvedAt" timestamp with time zone,
	CONSTRAINT "position_title_equivalents_language_unique" UNIQUE("positionId","language")
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "review_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"generationId" uuid NOT NULL,
	"round" integer NOT NULL,
	"rating" integer NOT NULL,
	"inputTokens" integer NOT NULL,
	"outputTokens" integer NOT NULL,
	"kept" boolean DEFAULT false NOT NULL,
	"encryptedReview" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resume_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"sections" jsonb NOT NULL,
	"encryptedHeader" text,
	CONSTRAINT "resume_templates_profile_id_unique" UNIQUE("profileId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "style_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"encryptedSamples" text NOT NULL,
	"encryptedProfile" text,
	"approvedAt" timestamp with time zone,
	CONSTRAINT "style_profiles_profile_id_unique" UNIQUE("profileId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_data_keys" ADD CONSTRAINT "user_data_keys_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_keys" ADD CONSTRAINT "ai_keys_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_taskId_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "courtesy_grants" ADD CONSTRAINT "courtesy_grants_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "courtesy_grants" ADD CONSTRAINT "courtesy_grants_grantedBy_users_id_fk" FOREIGN KEY ("grantedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_lotId_credit_lots_id_fk" FOREIGN KEY ("lotId") REFERENCES "public"."credit_lots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_taskId_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stored_credit_confirmations" ADD CONSTRAINT "stored_credit_confirmations_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
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
DO $$ BEGIN
 ALTER TABLE "career_profiles" ADD CONSTRAINT "career_profiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credentials" ADD CONSTRAINT "credentials_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "career_goals" ADD CONSTRAINT "career_goals_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sensitive_items" ADD CONSTRAINT "sensitive_items_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sensitive_items" ADD CONSTRAINT "sensitive_items_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fit_check_items" ADD CONSTRAINT "fit_check_items_fitCheckId_fit_checks_id_fk" FOREIGN KEY ("fitCheckId") REFERENCES "public"."fit_checks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fit_check_items" ADD CONSTRAINT "fit_check_items_termId_opening_terms_id_fk" FOREIGN KEY ("termId") REFERENCES "public"."opening_terms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fit_checks" ADD CONSTRAINT "fit_checks_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opening_terms" ADD CONSTRAINT "opening_terms_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "openings" ADD CONSTRAINT "openings_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_events" ADD CONSTRAINT "application_events_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_versionId_document_versions_id_fk" FOREIGN KEY ("versionId") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_snapshotId_document_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."document_snapshots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dismissed_reminders" ADD CONSTRAINT "dismissed_reminders_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tracker_settings" ADD CONSTRAINT "tracker_settings_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_instructions" ADD CONSTRAINT "application_instructions_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_instructions" ADD CONSTRAINT "application_instructions_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
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
DO $$ BEGIN
 ALTER TABLE "instruction_points" ADD CONSTRAINT "instruction_points_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instruction_points" ADD CONSTRAINT "instruction_points_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instruction_points" ADD CONSTRAINT "instruction_points_applicationInstructionsId_application_instructions_id_fk" FOREIGN KEY ("applicationInstructionsId") REFERENCES "public"."application_instructions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instruction_points" ADD CONSTRAINT "instruction_points_fitCheckItemId_fit_check_items_id_fk" FOREIGN KEY ("fitCheckItemId") REFERENCES "public"."fit_check_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instruction_points" ADD CONSTRAINT "instruction_points_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instruction_points" ADD CONSTRAINT "instruction_points_credentialId_credentials_id_fk" FOREIGN KEY ("credentialId") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "locked_fact_overrides" ADD CONSTRAINT "locked_fact_overrides_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "locked_fact_overrides" ADD CONSTRAINT "locked_fact_overrides_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "locked_fact_overrides" ADD CONSTRAINT "locked_fact_overrides_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "locked_fact_overrides" ADD CONSTRAINT "locked_fact_overrides_instructionPointId_instruction_points_id_fk" FOREIGN KEY ("instructionPointId") REFERENCES "public"."instruction_points"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_facts" ADD CONSTRAINT "company_facts_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_facts" ADD CONSTRAINT "company_facts_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_facts" ADD CONSTRAINT "company_facts_researchId_company_research_id_fk" FOREIGN KEY ("researchId") REFERENCES "public"."company_research"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_research" ADD CONSTRAINT "company_research_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_research" ADD CONSTRAINT "company_research_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "motivation_interviews" ADD CONSTRAINT "motivation_interviews_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "motivation_interviews" ADD CONSTRAINT "motivation_interviews_openingId_openings_id_fk" FOREIGN KEY ("openingId") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "motivation_points" ADD CONSTRAINT "motivation_points_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "motivation_points" ADD CONSTRAINT "motivation_points_interviewId_motivation_interviews_id_fk" FOREIGN KEY ("interviewId") REFERENCES "public"."motivation_interviews"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "motivation_turns" ADD CONSTRAINT "motivation_turns_interviewId_motivation_interviews_id_fk" FOREIGN KEY ("interviewId") REFERENCES "public"."motivation_interviews"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_snapshots" ADD CONSTRAINT "document_snapshots_versionId_document_versions_id_fk" FOREIGN KEY ("versionId") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_versionId_document_versions_id_fk" FOREIGN KEY ("versionId") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_sourceVersionId_document_versions_id_fk" FOREIGN KEY ("sourceVersionId") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_resumeVersionId_document_versions_id_fk" FOREIGN KEY ("resumeVersionId") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "position_title_equivalents" ADD CONSTRAINT "position_title_equivalents_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "position_title_equivalents" ADD CONSTRAINT "position_title_equivalents_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rendered_files" ADD CONSTRAINT "rendered_files_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rendered_files" ADD CONSTRAINT "rendered_files_snapshotId_document_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."document_snapshots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_rounds" ADD CONSTRAINT "review_rounds_generationId_generations_id_fk" FOREIGN KEY ("generationId") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resume_templates" ADD CONSTRAINT "resume_templates_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_full_name_idx" ON "users" USING btree ("fullName");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_id_idx" ON "tasks" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_run_id_idx" ON "tasks" USING btree ("runId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_user_id_idx" ON "ai_usage" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_task_id_idx" ON "ai_usage" USING btree ("taskId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courtesy_grants_user_id_idx" ON "courtesy_grants" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_entries_user_id_idx" ON "credit_entries" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_entries_lot_id_idx" ON "credit_entries" USING btree ("lotId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_entries_task_id_idx" ON "credit_entries" USING btree ("taskId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_lots_user_id_idx" ON "credit_lots" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_user_id_idx" ON "subscriptions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credentials_profile_id_idx" ON "credentials" USING btree ("profileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "positions_profile_id_idx" ON "positions" USING btree ("profileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_documents_profile_id_idx" ON "source_documents" USING btree ("profileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_goals_profile_id_idx" ON "career_goals" USING btree ("profileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sensitive_items_profile_id_idx" ON "sensitive_items" USING btree ("profileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fit_check_items_fit_check_id_idx" ON "fit_check_items" USING btree ("fitCheckId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fit_checks_opening_id_idx" ON "fit_checks" USING btree ("openingId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opening_terms_opening_id_idx" ON "opening_terms" USING btree ("openingId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "openings_profile_id_idx" ON "openings" USING btree ("profileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_profile_id_idx" ON "applications" USING btree ("profileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_events_application_id_idx" ON "application_events" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_submissions_application_id_idx" ON "application_submissions" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_instructions_opening_id_idx" ON "application_instructions" USING btree ("openingId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_overrides_opening_id_idx" ON "application_overrides" USING btree ("openingId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "instruction_points_opening_id_idx" ON "instruction_points" USING btree ("openingId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_facts_opening_id_idx" ON "company_facts" USING btree ("openingId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_research_opening_id_idx" ON "company_research" USING btree ("openingId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "motivation_points_interview_id_idx" ON "motivation_points" USING btree ("interviewId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_versions_document_id_idx" ON "document_versions" USING btree ("documentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_profile_id_idx" ON "documents" USING btree ("profileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generations_document_id_idx" ON "generations" USING btree ("documentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "position_title_equivalents_profile_id_idx" ON "position_title_equivalents" USING btree ("profileId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_rounds_generation_id_idx" ON "review_rounds" USING btree ("generationId");