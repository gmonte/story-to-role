CREATE TABLE IF NOT EXISTS "profile_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"chatId" uuid NOT NULL,
	"messageId" text NOT NULL,
	"position" integer NOT NULL,
	"encryptedMessage" text NOT NULL,
	"final" boolean DEFAULT true NOT NULL,
	CONSTRAINT "profile_chat_messages_chat_message_unique" UNIQUE("chatId","messageId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" uuid NOT NULL,
	"encryptedState" text,
	"lastOutEventId" text,
	"lastInEventId" text,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"documentId" uuid NOT NULL,
	"origin" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"encryptedContent" text NOT NULL,
	"resolvedAt" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_chat_messages" ADD CONSTRAINT "profile_chat_messages_chatId_profile_chats_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."profile_chats"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_chats" ADD CONSTRAINT "profile_chats_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_suggestions" ADD CONSTRAINT "profile_suggestions_documentId_profile_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."profile_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_chat_messages_chat_position_idx" ON "profile_chat_messages" USING btree ("chatId","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_chats_user_id_idx" ON "profile_chats" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_suggestions_document_status_idx" ON "profile_suggestions" USING btree ("documentId","status");