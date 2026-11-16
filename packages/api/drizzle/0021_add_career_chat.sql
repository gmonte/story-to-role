CREATE TABLE IF NOT EXISTS "career_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"chatId" uuid NOT NULL,
	"messageId" text NOT NULL,
	"position" integer NOT NULL,
	"encryptedMessage" text NOT NULL,
	"final" boolean DEFAULT true NOT NULL,
	CONSTRAINT "career_chat_messages_chat_message_unique" UNIQUE("chatId","messageId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "career_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"profileId" uuid NOT NULL,
	"encryptedState" text,
	"lastOutEventId" text,
	"lastInEventId" text,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "career_chat_messages" ADD CONSTRAINT "career_chat_messages_chatId_career_chats_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."career_chats"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "career_chats" ADD CONSTRAINT "career_chats_profileId_career_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."career_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_chat_messages_chat_position_idx" ON "career_chat_messages" USING btree ("chatId","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "career_chats_profile_idx" ON "career_chats" USING btree ("profileId");