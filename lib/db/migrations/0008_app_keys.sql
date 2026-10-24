CREATE TABLE "app_keys" (
	"platform" "platform" PRIMARY KEY NOT NULL,
	"client_id" varchar(255) NOT NULL,
	"secret" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
