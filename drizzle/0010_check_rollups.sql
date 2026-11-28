CREATE TABLE "app"."check_rollups_hourly" (
	"monitor_id" uuid NOT NULL,
	"hour_start" timestamp with time zone NOT NULL,
	"total" integer NOT NULL,
	"successful" integer NOT NULL,
	"latency_sum" integer NOT NULL,
	"latency_count" integer NOT NULL,
	CONSTRAINT "check_rollups_hourly_pk" PRIMARY KEY("monitor_id","hour_start"),
	CONSTRAINT "check_rollups_hourly_counts" CHECK ("app"."check_rollups_hourly"."total" >= 0 AND "app"."check_rollups_hourly"."successful" BETWEEN 0 AND "app"."check_rollups_hourly"."total" AND "app"."check_rollups_hourly"."latency_count" BETWEEN 0 AND "app"."check_rollups_hourly"."successful" AND "app"."check_rollups_hourly"."latency_sum" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."check_rollups_hourly" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."rollup_state" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"rolled_through" timestamp with time zone NOT NULL,
	CONSTRAINT "rollup_state_singleton" CHECK ("app"."rollup_state"."id" = true)
);
--> statement-breakpoint
ALTER TABLE "app"."rollup_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."check_rollups_hourly" ADD CONSTRAINT "check_rollups_hourly_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "app"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "check_rollups_hourly_owner_read" ON "app"."check_rollups_hourly" AS PERMISSIVE FOR SELECT TO "sentinel_app" USING (EXISTS (
				SELECT 1
				FROM app.monitors AS m
				WHERE m.id = monitor_id
				AND m.owner_id = current_setting('app.user_id', true)
			));--> statement-breakpoint
CREATE POLICY "rollup_state_read" ON "app"."rollup_state" AS PERMISSIVE FOR SELECT TO "sentinel_app" USING (true);


--> statement-breakpoint
GRANT SELECT ON app.check_rollups_hourly TO sentinel_app;
--> statement-breakpoint
GRANT SELECT ON app.rollup_state TO sentinel_app;
--> statement-breakpoint
INSERT INTO app.rollup_state (id, rolled_through)
SELECT
	true,
		COALESCE(date_trunc('hour', min(checked_at), 'UTC'), date_trunc('hour', now(), 'UTC'))
FROM app.check_results;
--> statement-breakpoint
CREATE FUNCTION app.run_check_retention(
	max_hours integer DEFAULT 168,
	delete_batch integer DEFAULT 20000
)
RETURNS TABLE (hours_rolled integer, rows_deleted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET timezone = 'UTC'
AS $$
DECLARE
	state_through timestamptz;
	roll_to timestamptz;
	prune_before timestamptz;
	monitor_row record;
	removed integer;
BEGIN
	hours_rolled := 0;
	rows_deleted := 0;

	-- A second instance skips instead of waiting, so runs never overlap
	SELECT s.rolled_through INTO state_through
	FROM app.rollup_state AS s
	WHERE s.id
	FOR UPDATE SKIP LOCKED;

	IF NOT FOUND THEN
		RETURN NEXT;
		RETURN;
	END IF;

	-- Only complete hours, with a 2 hour lag for late writes
	roll_to := least(
		date_trunc('hour', now() - interval '2 hours'),
		state_through + make_interval(hours => max_hours)
	);

	IF roll_to > state_through THEN
		INSERT INTO app.check_rollups_hourly
			(monitor_id, hour_start, total, successful, latency_sum, latency_count)
		SELECT
			cr.monitor_id,
			date_trunc('hour', cr.checked_at),
			count(*)::integer,
			(count(*) FILTER (WHERE cr.status = 'up'))::integer,
			(coalesce(sum(cr.latency_ms) FILTER (WHERE cr.status = 'up'), 0))::integer,
			(count(cr.latency_ms) FILTER (WHERE cr.status = 'up'))::integer
		FROM app.monitors AS m
		JOIN app.check_results AS cr
			ON cr.monitor_id = m.id
			AND cr.checked_at >= state_through
			AND cr.checked_at < roll_to
		GROUP BY cr.monitor_id, date_trunc('hour', cr.checked_at)
		ON CONFLICT (monitor_id, hour_start) DO UPDATE
		SET total = EXCLUDED.total,
			successful = EXCLUDED.successful,
			latency_sum = EXCLUDED.latency_sum,
			latency_count = EXCLUDED.latency_count;

		UPDATE app.rollup_state SET rolled_through = roll_to WHERE id;

		hours_rolled := (extract(epoch FROM (roll_to - state_through)) / 3600)::integer;
		state_through := roll_to;
	END IF;

	-- Raw rows are only deleted once their hour is rolled up
	prune_before := least(date_trunc('hour', now() - interval '90 days'), state_through);

	FOR monitor_row IN SELECT m.id FROM app.monitors AS m LOOP
		EXIT WHEN rows_deleted >= delete_batch;

		DELETE FROM app.check_results
		WHERE ctid IN (
			SELECT cr.ctid
			FROM app.check_results AS cr
			WHERE cr.monitor_id = monitor_row.id AND cr.checked_at < prune_before
			LIMIT delete_batch - rows_deleted
		);

		GET DIAGNOSTICS removed = ROW_COUNT;
		rows_deleted := rows_deleted + removed;
	END LOOP;

	-- Rollups are kept for 400 days
	DELETE FROM app.check_rollups_hourly
	WHERE hour_start < now() - interval '400 days';

	RETURN NEXT;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.run_check_retention(integer, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.run_check_retention(integer, integer) TO sentinel_worker;