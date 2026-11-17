ALTER TABLE "source_documents" ADD COLUMN IF NOT EXISTS "importStatus" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN IF NOT EXISTS "importRejection" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN IF NOT EXISTS "encryptedImportSummary" text;--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN IF NOT EXISTS "importSummarySaidAt" timestamp with time zone;