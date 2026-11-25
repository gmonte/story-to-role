ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "documentKind" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "generationKind" text;