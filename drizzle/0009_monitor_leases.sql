CREATE TABLE "app"."monitor_leases" (
	"monitor_id" uuid PRIMARY KEY NOT NULL,
	"last_started_at" timestamp with time zone,
	"lease_owner" text,
	"lease_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."monitor_leases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."monitor_leases" ADD CONSTRAINT "monitor_leases_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "app"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "monitor_leases_worker_access" ON "app"."monitor_leases" AS PERMISSIVE FOR ALL TO "sentinel_worker" USING (EXISTS (
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
GRANT SELECT, INSERT, UPDATE ON app.monitor_leases TO sentinel_worker;