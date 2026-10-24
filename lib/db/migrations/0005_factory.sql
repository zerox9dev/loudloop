CREATE TYPE "public"."project_kind" AS ENUM('founder', 'product');--> statement-breakpoint
ALTER TYPE "public"."post_status" ADD VALUE 'review';--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"kind" varchar(16) DEFAULT 'note' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"url" text,
	"source_item_id" integer,
	"status" varchar(16) DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"referrer" text
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(16) NOT NULL,
	"project_id" integer NOT NULL,
	"target_id" integer,
	"url" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "links_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"weekday" integer NOT NULL,
	"time" varchar(5) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_targets" ADD COLUMN "text" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "idea_id" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "kind" "project_kind" DEFAULT 'product' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "brief" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_clicks" ADD CONSTRAINT "link_clicks_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_target_id_post_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."post_targets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ideas_project_status" ON "ideas" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ideas_source_item" ON "ideas" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "link_clicks_link_at" ON "link_clicks" USING btree ("link_id","at");--> statement-breakpoint
CREATE INDEX "links_project" ON "links" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "links_target" ON "links" USING btree ("target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slots_account_weekday_time" ON "slots" USING btree ("account_id","weekday","time");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_single_founder" ON "projects" USING btree ("kind") WHERE "projects"."kind" = 'founder';--> statement-breakpoint
-- The default project becomes the founder's personal brand.
UPDATE "projects" SET "kind" = 'founder', "name" = CASE WHEN "name" = 'Личное' THEN 'Личный бренд' ELSE "name" END WHERE "slug" = 'personal';
