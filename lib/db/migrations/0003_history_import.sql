ALTER TABLE "accounts" ADD COLUMN "history_imported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "imported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "post_targets_account_external" ON "post_targets" USING btree ("account_id","external_id");