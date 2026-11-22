CREATE TABLE "app"."user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"default_interval_seconds" integer DEFAULT 300 NOT NULL,
	"default_timeout_ms" integer DEFAULT 10000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_interval_range" CHECK ("app"."user_settings"."default_interval_seconds" BETWEEN 60 AND 86400),
	CONSTRAINT "user_settings_timeout_range" CHECK ("app"."user_settings"."default_timeout_ms" BETWEEN 1000 AND 30000)
);
--> statement-breakpoint
ALTER TABLE "app"."user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "user_settings_owner_access" ON "app"."user_settings" AS PERMISSIVE FOR ALL TO "sentinel_app" USING (user_id = current_setting('app.user_id', true)) WITH CHECK (user_id = current_setting('app.user_id', true));

GRANT SELECT, INSERT, UPDATE ON app.user_settings TO sentinel_app;