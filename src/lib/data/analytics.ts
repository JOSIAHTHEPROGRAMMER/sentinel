import "server-only";

import { eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { incidents, monitors } from "@/lib/db/schema/app";
import { type ChartBucket, fillBuckets } from "./analytics-buckets";
import {
	type AnalyticsRange,
	type AnalyticsSummary,
	bucketSecondsForRange,
	buildBucketStarts,
	calculateUptimePercentage,
	rangeToMs,
} from "./analytics-shared";

const HOUR_MS = 3_600_000;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type Windows = {
	headFrom: string;
	headTo: string;
	rollFrom: string;
	rollTo: string;
	tailFrom: string;
};

// Splits a window into raw head, rolled-up middle and raw tail. Rollups cover
// whole UTC hours before the watermark; raw rows cover everything else, so a
// stalled rollup job can never make the window undercount.
async function planWindows(tx: Transaction, sinceMs: number): Promise<Windows> {
	const iso = (ms: number) => new Date(ms).toISOString();

	const result = await tx.execute<{ through: string | null }>(sql`
		SELECT to_char(
			rolled_through AT TIME ZONE 'UTC',
			'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
		) AS through
		FROM app.rollup_state
		LIMIT 1
	`);

	const through = result.rows[0]?.through;

	if (!through) {
		const since = iso(sinceMs);

		return {
			headFrom: since,
			headTo: since,
			rollFrom: since,
			rollTo: since,
			tailFrom: since,
		};
	}

	const throughMs = Date.parse(through);
	const rollFromMs = Math.min(
		Math.ceil(sinceMs / HOUR_MS) * HOUR_MS,
		throughMs,
	);

	return {
		headFrom: iso(sinceMs),
		headTo: iso(Math.max(sinceMs, rollFromMs)),
		rollFrom: iso(rollFromMs),
		rollTo: iso(throughMs),
		tailFrom: iso(Math.max(throughMs, sinceMs)),
	};
}

function rawTotals(from: string, to: string) {
	return sql`
		SELECT
			count(*)::int AS total,
			(count(*) FILTER (WHERE cr.status = 'up'))::int AS ok,
			(coalesce(sum(cr.latency_ms) FILTER (WHERE cr.status = 'up'), 0))::bigint AS lsum,
			(count(cr.latency_ms) FILTER (WHERE cr.status = 'up'))::int AS lcount
		FROM app.check_results AS cr
		JOIN app.monitors AS m ON m.id = cr.monitor_id
		WHERE m.deleted_at IS NULL
			AND cr.checked_at >= ${from}::timestamptz
			AND cr.checked_at < ${to}::timestamptz`;
}

function rollupTotals(from: string, to: string) {
	return sql`
		SELECT
			(coalesce(sum(r.total), 0))::int AS total,
			(coalesce(sum(r.successful), 0))::int AS ok,
			(coalesce(sum(r.latency_sum), 0))::bigint AS lsum,
			(coalesce(sum(r.latency_count), 0))::int AS lcount
		FROM app.check_rollups_hourly AS r
		JOIN app.monitors AS m ON m.id = r.monitor_id
		WHERE m.deleted_at IS NULL
			AND r.hour_start >= ${from}::timestamptz
			AND r.hour_start < ${to}::timestamptz`;
}

function rawBuckets(from: string, to: string, bucketSeconds: number) {
	return sql`
		SELECT
			floor(extract(epoch FROM cr.checked_at) / ${sql.raw(String(bucketSeconds))})::int AS bucket,
			count(*)::int AS total,
			(count(*) FILTER (WHERE cr.status = 'up'))::int AS ok,
			(coalesce(sum(cr.latency_ms) FILTER (WHERE cr.status = 'up'), 0))::bigint AS lsum,
			(count(cr.latency_ms) FILTER (WHERE cr.status = 'up'))::int AS lcount
		FROM app.check_results AS cr
		JOIN app.monitors AS m ON m.id = cr.monitor_id
		WHERE m.deleted_at IS NULL
			AND cr.checked_at >= ${from}::timestamptz
			AND cr.checked_at < ${to}::timestamptz
		GROUP BY 1`;
}

function rollupBuckets(from: string, to: string, bucketSeconds: number) {
	return sql`
		SELECT
			floor(extract(epoch FROM r.hour_start) / ${sql.raw(String(bucketSeconds))})::int AS bucket,
			(sum(r.total))::int AS total,
			(sum(r.successful))::int AS ok,
			(sum(r.latency_sum))::bigint AS lsum,
			(sum(r.latency_count))::int AS lcount
		FROM app.check_rollups_hourly AS r
		JOIN app.monitors AS m ON m.id = r.monitor_id
		WHERE m.deleted_at IS NULL
			AND r.hour_start >= ${from}::timestamptz
			AND r.hour_start < ${to}::timestamptz
		GROUP BY 1`;
}

export async function getAnalyticsSummary(
	userId: string,
	range: AnalyticsRange,
): Promise<AnalyticsSummary> {
	const sinceMs = Date.now() - rangeToMs(range);
	const sinceIso = new Date(sinceMs).toISOString();

	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const windows = await planWindows(tx, sinceMs);

		const checkRows = await tx.execute<{
			total: number | null;
			ok: number | null;
			avg: number | null;
		}>(sql`
			SELECT
				sum(u.total)::int AS total,
				sum(u.ok)::int AS ok,
				(round(sum(u.lsum)::numeric / nullif(sum(u.lcount), 0)))::int AS avg
			FROM (
				${rawTotals(windows.headFrom, windows.headTo)}
				UNION ALL
				${rawTotals(windows.tailFrom, "infinity")}
				UNION ALL
				${rollupTotals(windows.rollFrom, windows.rollTo)}
			) AS u
		`);

		const checks = checkRows.rows[0];

		const [incidentStats] = await tx
			.select({
				open: sql<number>`(count(*) filter (where ${incidents.resolvedAt} is null))::int`,
				started: sql<number>`(count(*) filter (where ${incidents.startedAt} >= ${sinceIso}::timestamptz))::int`,
				resolved: sql<number>`(count(*) filter (where ${incidents.resolvedAt} >= ${sinceIso}::timestamptz))::int`,
			})
			.from(incidents)
			.innerJoin(monitors, eq(monitors.id, incidents.monitorId))
			.where(isNull(monitors.deletedAt));

		const totalChecks = checks?.total ?? 0;
		const successfulChecks = checks?.ok ?? 0;

		return {
			range,
			totalChecks,
			successfulChecks,
			failedChecks: totalChecks - successfulChecks,
			uptimePercentage: calculateUptimePercentage(
				successfulChecks,
				totalChecks,
			),
			averageResponseTimeMs: checks?.avg ?? null,
			openIncidents: incidentStats?.open ?? 0,
			incidentsStarted: incidentStats?.started ?? 0,
			incidentsResolved: incidentStats?.resolved ?? 0,
		};
	});
}

export async function getDashboardTrend(
	userId: string,
	range: AnalyticsRange,
): Promise<ChartBucket[]> {
	const now = Date.now();
	const bucketSeconds = bucketSecondsForRange(range);
	const starts = buildBucketStarts(range, now);
	const sinceMs = starts[0] ?? now - rangeToMs(range);

	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const windows = await planWindows(tx, sinceMs);

		const result = await tx.execute<{
			bucket: number;
			total: number;
			successful: number;
			averageLatencyMs: number | null;
		}>(sql`
			SELECT
				u.bucket AS bucket,
				sum(u.total)::int AS total,
				sum(u.ok)::int AS successful,
				(round(sum(u.lsum)::numeric / nullif(sum(u.lcount), 0)))::int AS "averageLatencyMs"
			FROM (
				${rawBuckets(windows.headFrom, windows.headTo, bucketSeconds)}
				UNION ALL
				${rawBuckets(windows.tailFrom, "infinity", bucketSeconds)}
				UNION ALL
				${rollupBuckets(windows.rollFrom, windows.rollTo, bucketSeconds)}
			) AS u
			GROUP BY u.bucket
			ORDER BY u.bucket
		`);

		return fillBuckets(result.rows, starts, bucketSeconds);
	});
}

// One index lookup per monitor for its newest check, instead of scanning
// every check row to compute max(checked_at)
export async function getLastCheckTimes(
	userId: string,
): Promise<Record<string, string>> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const result = await tx.execute<{
			monitor_id: string;
			last_checked_at: string;
		}>(sql`
			SELECT
				m.id AS monitor_id,
				to_char(
					latest.checked_at AT TIME ZONE 'UTC',
					'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
				) AS last_checked_at
			FROM app.monitors AS m
			CROSS JOIN LATERAL (
				SELECT cr.checked_at
				FROM app.check_results AS cr
				WHERE cr.monitor_id = m.id
				ORDER BY cr.checked_at DESC
				LIMIT 1
			) AS latest
			WHERE m.deleted_at IS NULL
		`);

		return Object.fromEntries(
			result.rows.map((row) => [row.monitor_id, row.last_checked_at]),
		);
	});
}
