CREATE TABLE "app"."monitor_state" (
	"monitor_id" uuid PRIMARY KEY NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"consecutive_successes" integer DEFAULT 0 NOT NULL,
	"failure_streak_started_at" timestamp with time zone,
	"success_streak_started_at" timestamp with time zone,
	"failure_reason" text,
	"last_checked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "monitor_state_counters_non_negative" CHECK ("app"."monitor_state"."consecutive_failures" >= 0 AND "app"."monitor_state"."consecutive_successes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."monitor_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."monitors" ADD COLUMN "failure_threshold" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."monitors" ADD COLUMN "recovery_threshold" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."monitor_state" ADD CONSTRAINT "monitor_state_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "app"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."monitors" ADD CONSTRAINT "monitors_failure_threshold_range" CHECK ("app"."monitors"."failure_threshold" BETWEEN 1 AND 10);--> statement-breakpoint
ALTER TABLE "app"."monitors" ADD CONSTRAINT "monitors_recovery_threshold_range" CHECK ("app"."monitors"."recovery_threshold" BETWEEN 1 AND 10);--> statement-breakpoint
CREATE POLICY "monitor_state_worker_access" ON "app"."monitor_state" AS PERMISSIVE FOR ALL TO "sentinel_worker" USING (EXISTS (
				SELECT 1
				FROM app.monitors AS m
				WHERE m.id = monitor_id
				AND m.enabled = true
				AND m.deleted_at IS NULL
			)) WITH CHECK (EXISTS (
				SELECT 1
				FROM app.monitors AS m
				WHERE m.id = monitor_id
				AND m.enabled = true
				AND m.deleted_at IS NULL
			));

--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON app.monitor_state TO sentinel_worker;