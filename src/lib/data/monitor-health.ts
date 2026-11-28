import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

export type MonitorHealth = {
  latestCheckedAt: string | null;
  latestStatus: "up" | "down" | "timeout" | "error" | null;
  // The last 24 hours, regardless of the dashboard's selected range
  totalChecks: number;
  successfulChecks: number;
};

// One index lookup per monitor for its newest check, and one index range per
// monitor for the 24 hour counts. Monitors without checks are still returned.
export async function getMonitorHealth(
  userId: string,
  now: number,
): Promise<Record<string, MonitorHealth>> {
  const since = new Date(now - DAY_MS).toISOString();

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

    const result = await tx.execute<{
      monitor_id: string;
      latest_checked_at: string | null;
      latest_status: string | null;
      total: number | null;
      ok: number | null;
    }>(sql`
			SELECT
				m.id AS monitor_id,
				to_char(
					latest.checked_at AT TIME ZONE 'UTC',
					'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
				) AS latest_checked_at,
				latest.status::text AS latest_status,
				w.total AS total,
				w.ok AS ok
			FROM app.monitors AS m
			LEFT JOIN LATERAL (
				SELECT cr.checked_at, cr.status
				FROM app.check_results AS cr
				WHERE cr.monitor_id = m.id
				ORDER BY cr.checked_at DESC
				LIMIT 1
			) AS latest ON true
			LEFT JOIN LATERAL (
				SELECT
					count(*)::int AS total,
					(count(*) FILTER (WHERE cr.status = 'up'))::int AS ok
				FROM app.check_results AS cr
				WHERE cr.monitor_id = m.id AND cr.checked_at >= ${since}::timestamptz
			) AS w ON true
			WHERE m.deleted_at IS NULL
		`);

    return Object.fromEntries(
      result.rows.map((row) => [
        row.monitor_id,
        {
          latestCheckedAt: row.latest_checked_at,
          latestStatus: row.latest_status as MonitorHealth["latestStatus"],
          totalChecks: row.total ?? 0,
          successfulChecks: row.ok ?? 0,
        },
      ]),
    );
  });
}
