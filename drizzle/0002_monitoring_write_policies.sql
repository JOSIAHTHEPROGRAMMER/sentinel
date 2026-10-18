CREATE POLICY check_results_owner_insert
ON app.check_results
FOR INSERT
TO sentinel_app
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM app.monitors AS m
        WHERE m.id = monitor_id
          AND m.owner_id::text =
              current_setting('app.user_id', true)
    )
);

CREATE POLICY incidents_owner_insert
ON app.incidents
FOR INSERT
TO sentinel_app
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM app.monitors AS m
        WHERE m.id = monitor_id
          AND m.owner_id::text =
              current_setting('app.user_id', true)
    )
);

CREATE POLICY incidents_owner_update
ON app.incidents
FOR UPDATE
TO sentinel_app
USING (
    EXISTS (
        SELECT 1
        FROM app.monitors AS m
        WHERE m.id = monitor_id
          AND m.owner_id::text =
              current_setting('app.user_id', true)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM app.monitors AS m
        WHERE m.id = monitor_id
          AND m.owner_id::text =
              current_setting('app.user_id', true)
    )
);