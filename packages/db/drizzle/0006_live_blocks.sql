CREATE TYPE "public"."block_mode" AS ENUM('auto', 'live');--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD COLUMN "mode" "block_mode" DEFAULT 'auto' NOT NULL;