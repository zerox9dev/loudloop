ALTER TABLE "signals" ADD COLUMN "params" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" varchar(5) DEFAULT 'en' NOT NULL;--> statement-breakpoint
-- the existing owner has been using the Russian interface
UPDATE "users" SET "locale" = 'ru';
