CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(48) NOT NULL,
	"name" varchar(120) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "sources" DROP CONSTRAINT "sources_url_unique";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "project_id" integer;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "project_id" integer;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "project_id" integer;--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN "project_id" integer;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "project_id" integer;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "project_id" integer;--> statement-breakpoint
-- Existing data moves into a default "Личное" project, then the column becomes required.
INSERT INTO "projects" ("slug", "name", "position") VALUES ('personal', 'Личное', 0);--> statement-breakpoint
UPDATE "accounts" SET "project_id" = (SELECT "id" FROM "projects" WHERE "slug" = 'personal');--> statement-breakpoint
UPDATE "posts" SET "project_id" = (SELECT "id" FROM "projects" WHERE "slug" = 'personal');--> statement-breakpoint
UPDATE "challenges" SET "project_id" = COALESCE((SELECT a."project_id" FROM "accounts" a WHERE a."id" = "challenges"."account_id"), (SELECT "id" FROM "projects" WHERE "slug" = 'personal'));--> statement-breakpoint
UPDATE "signals" SET "project_id" = COALESCE((SELECT a."project_id" FROM "accounts" a WHERE a."id" = "signals"."account_id"), (SELECT "id" FROM "projects" WHERE "slug" = 'personal'));--> statement-breakpoint
UPDATE "sources" SET "project_id" = (SELECT "id" FROM "projects" WHERE "slug" = 'personal');--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_project" ON "accounts" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_platform_external" ON "accounts" USING btree ("platform","external_id");--> statement-breakpoint
CREATE INDEX "posts_project" ON "posts" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_project_url" ON "sources" USING btree ("project_id","url");