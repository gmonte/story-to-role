CREATE TABLE IF NOT EXISTS "career_narratives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"encryptedText" text NOT NULL,
	"encryptedThemes" text NOT NULL,
	"version" integer NOT NULL,
	"approvedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "career_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"userId" uuid NOT NULL,
	"interviewLanguage" text NOT NULL,
	"privacyNoticeAcceptedAt" timestamp with time zone,
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
CREATE TABLE IF NOT EXISTS "cross_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"fromPositionId" uuid,
	"toPositionId" uuid NOT NULL,
	"encryptedText" text NOT NULL,
	"resolvedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "position_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"positionId" uuid NOT NULL,
	"field" text NOT NULL,
	"encryptedOptions" text NOT NULL,
	"resolvedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "position_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"positionId" uuid NOT NULL,
	"encryptedSummary" text NOT NULL,
	"version" integer NOT NULL
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
	"scriptKind" text DEFAULT 'full' NOT NULL,
	"sourceDocumentIds" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"approvedAt" timestamp with time zone,
	"removedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"positionId" uuid NOT NULL,
	"encryptedName" text NOT NULL,
	"period" text,
	"closedAt" timestamp with time zone
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
	"encryptedText" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejectionReason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "timeline_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"sessionId" uuid,
	"kind" text NOT NULL,
	"encryptedPayload" text NOT NULL,
	"acceptedAt" timestamp with time zone,
	"rejectedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"positionId" uuid,
	"credentialId" uuid,
	"projectId" uuid,
	"kind" text NOT NULL,
	"encryptedText" text NOT NULL,
	"language" text NOT NULL,
	"encryptedSourceQuote" text NOT NULL,
	"sourceTurnId" uuid,
	"sourceDocumentId" uuid,
	"lowDetail" boolean DEFAULT false NOT NULL,
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
	"choice" text,
	"encryptedGeneralized" text,
	"reviewedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"encryptedName" text NOT NULL,
	"evidenceIds" uuid[] DEFAULT '{}'::uuid[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"positionId" uuid,
	"credentialId" uuid,
	"encryptedProblem" text NOT NULL,
	"encryptedAction" text NOT NULL,
	"encryptedPartners" text,
	"encryptedResult" text NOT NULL,
	"language" text NOT NULL,
	"evidenceIds" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"approvedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "draft_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"sessionId" uuid NOT NULL,
	"kind" text NOT NULL,
	"encryptedPayload" text NOT NULL,
	"encryptedQuote" text NOT NULL,
	"sourceTurnId" uuid,
	"sourceDocumentId" uuid,
	"projectId" uuid,
	"language" text NOT NULL,
	"lowDetail" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "draft_sensitive_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sessionId" uuid NOT NULL,
	"kind" text NOT NULL,
	"encryptedOriginal" text NOT NULL,
	"encryptedSuggestedGeneralization" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interview_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone,
	"profileId" uuid NOT NULL,
	"positionId" uuid,
	"credentialId" uuid,
	"projectId" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"stage" text DEFAULT 'confirm' NOT NULL,
	"scriptKind" text DEFAULT 'full' NOT NULL,
	"turnTokens" integer DEFAULT 0 NOT NULL,
	"inputTokens" integer DEFAULT 0 NOT NULL,
	"outputTokens" integer DEFAULT 0 NOT NULL,
	"extractionProposedAt" timestamp with time zone,
	"extractionApprovedAt" timestamp with time zone,
	"closedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interview_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sessionId" uuid NOT NULL,
	"role" text NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"encryptedContent" text,
	"language" text NOT NULL,
	"tokenCount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "career_narratives" ADD CONSTRAINT "career_narratives_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "career_profiles" ADD CONSTRAINT "career_profiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credentials" ADD CONSTRAINT "credentials_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cross_notes" ADD CONSTRAINT "cross_notes_fromPositionId_positions_id_fk" FOREIGN KEY ("fromPositionId") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cross_notes" ADD CONSTRAINT "cross_notes_toPositionId_positions_id_fk" FOREIGN KEY ("toPositionId") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "position_conflicts" ADD CONSTRAINT "position_conflicts_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "position_summaries" ADD CONSTRAINT "position_summaries_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "positions" ADD CONSTRAINT "positions_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timeline_proposals" ADD CONSTRAINT "timeline_proposals_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence" ADD CONSTRAINT "evidence_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence" ADD CONSTRAINT "evidence_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence" ADD CONSTRAINT "evidence_credentialId_credentials_id_fk" FOREIGN KEY ("credentialId") REFERENCES "public"."credentials"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence" ADD CONSTRAINT "evidence_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence" ADD CONSTRAINT "evidence_sourceDocumentId_source_documents_id_fk" FOREIGN KEY ("sourceDocumentId") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sensitive_items" ADD CONSTRAINT "sensitive_items_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sensitive_items" ADD CONSTRAINT "sensitive_items_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skills" ADD CONSTRAINT "skills_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stories" ADD CONSTRAINT "stories_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stories" ADD CONSTRAINT "stories_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stories" ADD CONSTRAINT "stories_credentialId_credentials_id_fk" FOREIGN KEY ("credentialId") REFERENCES "public"."credentials"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "draft_facts" ADD CONSTRAINT "draft_facts_sessionId_interview_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "draft_facts" ADD CONSTRAINT "draft_facts_sourceDocumentId_source_documents_id_fk" FOREIGN KEY ("sourceDocumentId") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "draft_facts" ADD CONSTRAINT "draft_facts_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "draft_sensitive_items" ADD CONSTRAINT "draft_sensitive_items_sessionId_interview_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_credentialId_credentials_id_fk" FOREIGN KEY ("credentialId") REFERENCES "public"."credentials"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interview_turns" ADD CONSTRAINT "interview_turns_sessionId_interview_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_narratives_profile_id_idx" ON "career_narratives" USING btree ("profileId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credentials_profile_id_idx" ON "credentials" USING btree ("profileId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cross_notes_to_position_id_idx" ON "cross_notes" USING btree ("toPositionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "position_conflicts_position_id_idx" ON "position_conflicts" USING btree ("positionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "position_summaries_position_id_idx" ON "position_summaries" USING btree ("positionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "positions_profile_id_idx" ON "positions" USING btree ("profileId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_position_id_idx" ON "projects" USING btree ("positionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_documents_profile_id_idx" ON "source_documents" USING btree ("profileId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timeline_proposals_profile_id_idx" ON "timeline_proposals" USING btree ("profileId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_profile_id_idx" ON "evidence" USING btree ("profileId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_position_id_idx" ON "evidence" USING btree ("positionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sensitive_items_profile_id_idx" ON "sensitive_items" USING btree ("profileId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skills_profile_id_idx" ON "skills" USING btree ("profileId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stories_position_id_idx" ON "stories" USING btree ("positionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "draft_facts_session_id_idx" ON "draft_facts" USING btree ("sessionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "draft_sensitive_items_session_id_idx" ON "draft_sensitive_items" USING btree ("sessionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_sessions_profile_id_idx" ON "interview_sessions" USING btree ("profileId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_sessions_position_id_idx" ON "interview_sessions" USING btree ("positionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_turns_session_id_idx" ON "interview_turns" USING btree ("sessionId");
