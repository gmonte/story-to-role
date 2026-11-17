ALTER TABLE "fit_check_items" ADD COLUMN IF NOT EXISTS "lackConfirmedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instruction_points" ADD COLUMN IF NOT EXISTS "sentToProfileAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "motivation_interviews" ADD COLUMN IF NOT EXISTS "storyPositionId" uuid;--> statement-breakpoint
ALTER TABLE "motivation_interviews" ADD COLUMN IF NOT EXISTS "encryptedStory" text;