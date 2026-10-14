
--> statement-breakpoint
CREATE TYPE "app"."check_status" AS ENUM('up', 'down', 'timeout', 'error');--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."check_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "app"."check_status" NOT NULL,
	"http_status" integer,
	"latency_ms" integer,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "app"."check_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"reason" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."incidents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"interval_seconds" integer DEFAULT 300 NOT NULL,
	"timeout_ms" integer DEFAULT 10000 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."monitors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."check_results" ADD CONSTRAINT "check_results_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "app"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."incidents" ADD CONSTRAINT "incidents_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "app"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."monitors" ADD CONSTRAINT "monitors_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "auth"."verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "check_results_monitor_checked_at_idx" ON "app"."check_results" USING btree ("monitor_id","checked_at");--> statement-breakpoint
CREATE INDEX "incidents_monitor_started_at_idx" ON "app"."incidents" USING btree ("monitor_id","started_at");--> statement-breakpoint
CREATE INDEX "monitors_owner_id_idx" ON "app"."monitors" USING btree ("owner_id");--> statement-breakpoint
CREATE POLICY "check_results_owner_read" ON "app"."check_results" AS PERMISSIVE FOR SELECT TO "sentinel_app" USING (EXISTS (
				SELECT 1
				FROM app.monitors AS m
				WHERE m.id = monitor_id
				AND m.owner_id = current_setting('app.user_id', true)
			));--> statement-breakpoint
CREATE POLICY "incidents_owner_read" ON "app"."incidents" AS PERMISSIVE FOR SELECT TO "sentinel_app" USING (EXISTS (
				SELECT 1
				FROM app.monitors AS m
				WHERE m.id = monitor_id
				AND m.owner_id = current_setting('app.user_id', true)
			));--> statement-breakpoint
CREATE POLICY "monitors_owner_access" ON "app"."monitors" AS PERMISSIVE FOR ALL TO "sentinel_app" USING (owner_id = current_setting('app.user_id', true)) WITH CHECK (owner_id = current_setting('app.user_id', true));


-- Allow the application role to access both schemas.
GRANT USAGE ON SCHEMA auth, app TO sentinel_app;

-- Allow Better Auth to manage authentication records.
GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA auth
TO sentinel_app;

-- Allow users to manage their own monitors.
GRANT SELECT, INSERT, UPDATE, DELETE
ON app.monitors
TO sentinel_app;

-- Allow users to read their own check history and incidents.
GRANT SELECT
ON app.check_results, app.incidents
TO sentinel_app;

-- Preserve authentication permissions for future tables
-- created by the migration role.
