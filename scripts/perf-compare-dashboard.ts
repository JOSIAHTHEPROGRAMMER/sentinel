import { like, sql } from "drizzle-orm";
import {
	getAnalyticsSummary,
	getDashboardTrend,
} from "../src/lib/data/analytics";
import {
	type AnalyticsRange,
	bucketSecondsForRange,
	buildBucketStarts,
	rangeToMs,
} from "../src/lib/data/analytics-shared";
import { closeDb, db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth";

const RANGES: AnalyticsRange[] = ["24h", "7d", "30d"];

function assertSafeEnvironment(): void {
	if (process.env.ALLOW_INTEGRATION_TESTS !== "true") {
		throw new Error("Refusing to run: ALLOW_INTEGRATION_TESTS is not true");
	}

	if (process.env.NODE_ENV === "production") {
		throw new Error("Refusing to run with NODE_ENV=production");
	}
}

// The second run is the one recorded, so the cache is warm
async function timed<T>(
	run: () => Promise<T>,
): Promise<{ value: T; ms: number }> {
	await run();

	const start = performance.now();
	const value = await run();

	return { value, ms: performance.now() - start };
}

async function oldSummary(userId: string, range: AnalyticsRange) {
	const since = new Date(Date.now() - rangeToMs(range)).toISOString();

	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const result = await tx.execute<{
			total: number;
			ok: number;
			avg: number | null;
		}>(sql`
			SELECT
				count(*)::int AS total,
				(count(*) FILTER (WHERE cr.status = 'up'))::int AS ok,
				(round(avg(cr.latency_ms) FILTER (WHERE cr.status = 'up')))::int AS avg
			FROM app.check_results AS cr
			JOIN app.monitors AS m ON m.id = cr.monitor_id
			WHERE m.deleted_at IS NULL AND cr.checked_at >= ${since}::timestamptz
		`);

		return result.rows[0];
	});
}

async function oldTrend(userId: string, range: AnalyticsRange) {
	const bucketSeconds = bucketSecondsForRange(range);
	const starts = buildBucketStarts(range, Date.now());
	const since = new Date(starts[0] ?? Date.now()).toISOString();

	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const result = await tx.execute<{
			bucket: number;
			total: number;
			ok: number;
			avg: number | null;
		}>(sql`
			SELECT
				floor(extract(epoch FROM cr.checked_at) / ${sql.raw(String(bucketSeconds))})::int AS bucket,
				count(*)::int AS total,
				(count(*) FILTER (WHERE cr.status = 'up'))::int AS ok,
				(round(avg(cr.latency_ms) FILTER (WHERE cr.status = 'up')))::int AS avg
			FROM app.check_results AS cr
			JOIN app.monitors AS m ON m.id = cr.monitor_id
			WHERE m.deleted_at IS NULL AND cr.checked_at >= ${since}::timestamptz
			GROUP BY 1
			ORDER BY 1
		`);

		return result.rows;
	});
}

async function main(): Promise<void> {
	assertSafeEnvironment();

	const [perfUser] = await db
		.select({ id: user.id })
		.from(user)
		.where(like(user.id, "perf-%"))
		.limit(1);

	if (!perfUser) {
		throw new Error("No perf user found. Run `npm run perf:seed` first.");
	}

	const userId = perfUser.id;

	console.info(
		"Query".padEnd(22),
		"old ms".padStart(9),
		"new ms".padStart(9),
		"  result",
	);

	for (const range of RANGES) {
		const before = await timed(() => oldSummary(userId, range));
		const after = await timed(() => getAnalyticsSummary(userId, range));

		const same =
			before.value?.total === after.value.totalChecks &&
			before.value?.ok === after.value.successfulChecks &&
			(before.value?.avg ?? null) === after.value.averageResponseTimeMs;

		console.info(
			`summary ${range}`.padEnd(22),
			before.ms.toFixed(1).padStart(9),
			after.ms.toFixed(1).padStart(9),
			same
				? "  identical"
				: `  DIFFERENT old=${JSON.stringify(before.value)} new total=${after.value.totalChecks} ok=${after.value.successfulChecks} avg=${after.value.averageResponseTimeMs}`,
		);
	}

	for (const range of RANGES) {
		const bucketSeconds = bucketSecondsForRange(range);
		const before = await timed(() => oldTrend(userId, range));
		const after = await timed(() => getDashboardTrend(userId, range));

		const oldByStart = new Map(
			before.value.map((row) => [row.bucket * bucketSeconds * 1000, row]),
		);

		let mismatches = 0;

		for (const bucket of after.value) {
			const row = oldByStart.get(Date.parse(bucket.start));

			if (
				(row?.total ?? 0) !== bucket.total ||
				(row?.ok ?? 0) !== bucket.successful ||
				(row?.avg ?? null) !== bucket.averageLatencyMs
			) {
				mismatches += 1;
			}
		}

		console.info(
			`trend ${range}`.padEnd(22),
			before.ms.toFixed(1).padStart(9),
			after.ms.toFixed(1).padStart(9),
			mismatches === 0 ? "  identical" : `  ${mismatches} bucket(s) DIFFERENT`,
		);
	}
}

main()
	.catch((error: unknown) => {
		console.error("Perf compare failed:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closeDb();
	});
