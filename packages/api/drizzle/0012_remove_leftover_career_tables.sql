DROP TABLE IF EXISTS "credentials" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "positions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "career_goals" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "sensitive_items" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "application_overrides" CASCADE;--> statement-breakpoint
ALTER TABLE "instruction_points" DROP COLUMN IF EXISTS "encryptedSensitiveItems";--> statement-breakpoint
ALTER TABLE "motivation_points" DROP COLUMN IF EXISTS "encryptedSensitiveItems";