CREATE UNIQUE INDEX incidents_one_open_per_monitor_idx
ON app.incidents (monitor_id)
WHERE resolved_at IS NULL;