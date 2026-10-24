CREATE TABLE "profile_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"day" date NOT NULL,
	"views" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_views_account_day" ON "profile_views" USING btree ("account_id","day");