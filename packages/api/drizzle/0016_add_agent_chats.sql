CREATE TABLE IF NOT EXISTS "agent_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"chatId" uuid NOT NULL,
	"messageId" text NOT NULL,
	"position" integer NOT NULL,
	"encryptedMessage" text NOT NULL,
	"final" boolean DEFAULT true NOT NULL,
	CONSTRAINT "agent_chat_messages_chat_message_unique" UNIQUE("chatId","messageId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"userId" uuid NOT NULL,
	"subject" text NOT NULL,
	"documentId" uuid,
	"encryptedState" text,
	"lastOutEventId" text,
	"lastInEventId" text,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_chatId_agent_chats_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."agent_chats"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_chats" ADD CONSTRAINT "agent_chats_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_chats" ADD CONSTRAINT "agent_chats_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_chat_messages_chat_position_idx" ON "agent_chat_messages" USING btree ("chatId","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_chats_user_id_idx" ON "agent_chats" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_chats_document_id_idx" ON "agent_chats" USING btree ("documentId");