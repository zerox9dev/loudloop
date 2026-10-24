ALTER TABLE "accounts" ADD COLUMN "history_error" text;--> statement-breakpoint
-- Share links created before projects existed showed exactly the personal data; with projects,
-- NULL means "every project", so pin them to 'personal' (idempotent: only pre-projects rows).
UPDATE "share_links" SET "project_id" = (SELECT "id" FROM "projects" WHERE "slug" = 'personal')
WHERE "project_id" IS NULL AND "created_at" < (SELECT "created_at" FROM "projects" WHERE "slug" = 'personal');
