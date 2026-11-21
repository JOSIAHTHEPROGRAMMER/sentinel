-- Custom SQL migration file, put your code below! --GRANT USAGE ON SCHEMA app TO sentinel_worker;
--> statement-breakpoint
GRANT SELECT ON app.monitors TO sentinel_worker;
--> statement-breakpoint
GRANT INSERT ON app.check_results TO sentinel_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON app.incidents TO sentinel_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.projects TO sentinel_app;
--> statement-breakpoint
DROP POLICY IF EXISTS monitors_worker_read ON app.monitors;
--> statement-breakpoint
CREATE POLICY monitors_worker_read
ON app.monitors
FOR SELECT
TO sentinel_worker
USING (enabled = true AND deleted_at IS NULL);
--> statement-breakpoint
DROP POLICY IF EXISTS check_results_worker_insert ON app.check_results;
--> statement-breakpoint
CREATE POLICY check_results_worker_insert
ON app.check_results
FOR INSERT
TO sentinel_worker
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM app.monitors AS m
		WHERE m.id = monitor_id
		  AND m.enabled = true
		  AND m.deleted_at IS NULL
	)
);
--> statement-breakpoint
DROP POLICY IF EXISTS incidents_worker_read ON app.incidents;
--> statement-breakpoint
CREATE POLICY incidents_worker_read
ON app.incidents
FOR SELECT
TO sentinel_worker
USING (
	EXISTS (
		SELECT 1
		FROM app.monitors AS m
		WHERE m.id = monitor_id
		  AND m.enabled = true
		  AND m.deleted_at IS NULL
	)
);
--> statement-breakpoint
DROP POLICY IF EXISTS incidents_worker_insert ON app.incidents;
--> statement-breakpoint
CREATE POLICY incidents_worker_insert
ON app.incidents
FOR INSERT
TO sentinel_worker
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM app.monitors AS m
		WHERE m.id = monitor_id
		  AND m.enabled = true
		  AND m.deleted_at IS NULL
	)
);
--> statement-breakpoint
DROP POLICY IF EXISTS incidents_worker_update ON app.incidents;
--> statement-breakpoint
CREATE POLICY incidents_worker_update
ON app.incidents
FOR UPDATE
TO sentinel_worker
USING (
	EXISTS (
		SELECT 1
		FROM app.monitors AS m
		WHERE m.id = monitor_id
		  AND m.enabled = true
		  AND m.deleted_at IS NULL
	)
)
WITH CHECK (
	EXISTS (
		SELECT 1
		FROM app.monitors AS m
		WHERE m.id = monitor_id
		  AND m.enabled = true
		  AND m.deleted_at IS NULL
	)
);
--> statement-breakpoint
DROP POLICY IF EXISTS check_results_owner_insert ON app.check_results;
--> statement-breakpoint
DROP POLICY IF EXISTS incidents_owner_insert ON app.incidents;
--> statement-breakpoint
DROP POLICY IF EXISTS incidents_owner_update ON app.incidents;