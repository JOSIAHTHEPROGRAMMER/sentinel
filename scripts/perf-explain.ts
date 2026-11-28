import { writeFile } from "node:fs/promises";
import { like, sql } from "drizzle-orm";
import { closeDb, db } from "../src/lib/db";
import { incidents, monitorLeases, monitors } from "../src/lib/db/schema/app";
import { user } from "../src/lib/db/schema/auth";
import { closeWorkerDb, workerDb } from "../src/lib/db/worker";

const PERF_USER_PREFIX = "perf-";
const OUTAGE_MONITOR_NAME = "Perf long outage";
const OUTAGE_INTERVAL_SECONDS = 900;
const OUTAGE_CHECKS = 5760; // 60 days at 15 minutes
const BUSY_MONITOR_NAME = "Perf monitor 06"; // one open incident
const OUTPUT_FILE = "perf-explain-output.txt";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type Result = { name: string; plan: string[] };

type Case = { name: string; statement: string };

class Rollback extends Error {}

function assertSafeEnvironment(): void {
	if (process.env.ALLOW_INTEGRATION_TESTS !== "true") {
		throw new Error("Refusing to run: ALLOW_INTEGRATION_TESTS is not true");
	}

	if (process.env.NODE_ENV === "production") {
		throw new Error("Refusing to run with NODE_ENV=production");
	}
}

async function asUser<T>(
	userId: string,
	run: (tx: Transaction) => Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		return run(tx);
	});
}

// Literals are inlined because EXPLAIN is run through plain SQL text
function lit(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function ts(ms: number): string {
	return `${lit(new Date(ms).toISOString())}::timestamptz`;
}

function uuid(id: string): string {
	return `${lit(id)}::uuid`;
}

async function rowsAs<T extends Record<string, unknown>>(
	userId: string,
	statement: string,
): Promise<T[]> {
	const result = await asUser(userId, (tx) => tx.execute(sql.raw(statement)));

	return result.rows as unknown as T[];
}

async function requireId(
	userId: string,
	statement: string,
	label: string,
): Promise<string> {
	const [row] = await rowsAs<{ id: string }>(userId, statement);

	if (!row) {
		throw new Error(`Could not find ${label}`);
	}

	return row.id;
}

async function ensureOutageMonitor(userId: string, now: number): Promise<void> {
	const existing = await rowsAs<{ id: string }>(
		userId,
		`SELECT id FROM app.monitors WHERE name = ${lit(OUTAGE_MONITOR_NAME)} LIMIT 1`,
	);

	if (existing.length > 0) {
		return;
	}

	console.info(
		"Creating the long-outage monitor (60 days down, one open incident).",
	);

	const anchorMs = now - 30_000;
	const anchorIso = new Date(anchorMs).toISOString();
	const stepMs = OUTAGE_INTERVAL_SECONDS * 1000;

	// Created enabled because the worker role may only write for enabled monitors
	const [created] = await asUser(userId, (tx) =>
		tx
			.insert(monitors)
			.values({
				ownerId: userId,
				name: OUTAGE_MONITOR_NAME,
				url: "https://perf-outage.invalid/health",
				intervalSeconds: OUTAGE_INTERVAL_SECONDS,
				timeoutMs: 10_000,
				enabled: true,
				createdAt: new Date(now - 90 * DAY_MS),
			})
			.returning({ id: monitors.id }),
	);

	if (!created) {
		throw new Error("Could not create the long-outage monitor");
	}

	const monitorId = created.id;

	await workerDb.transaction(async (tx) => {
		// Dated an hour ahead so a running worker never claims this monitor
		await tx
			.insert(monitorLeases)
			.values({ monitorId, lastStartedAt: new Date(now + HOUR_MS) });

		await tx.execute(sql`
			INSERT INTO app.check_results
				(monitor_id, checked_at, status, http_status, latency_ms, error_message)
			SELECT
				${monitorId}::uuid,
				${anchorIso}::timestamptz
					- ((${OUTAGE_CHECKS}::int - 1 - g.i) * ${OUTAGE_INTERVAL_SECONDS}::int)
					* interval '1 second',
				'timeout'::app.check_status,
				NULL,
				10000,
				'Request timed out'
			FROM generate_series(0, ${OUTAGE_CHECKS}::int - 1) AS g(i)
		`);

		// The last success sits just before the outage began
		await tx.execute(sql`
			INSERT INTO app.check_results
				(monitor_id, checked_at, status, http_status, latency_ms, error_message)
			VALUES (
				${monitorId}::uuid,
				${new Date(anchorMs - OUTAGE_CHECKS * stepMs).toISOString()}::timestamptz,
				'up'::app.check_status,
				200,
				120,
				NULL
			)
		`);

		await tx.insert(incidents).values({
			monitorId,
			startedAt: new Date(anchorMs - (OUTAGE_CHECKS - 1) * stepMs),
			resolvedAt: null,
			reason: "Request timed out",
		});
	});

	await asUser(userId, (tx) =>
		tx.update(monitors).set({ enabled: false }).where(sql`id = ${monitorId}`),
	);
}

function dashboardCases(now: number): Case[] {
	const ranges = [
		{ label: "24h", ms: DAY_MS, bucketSeconds: 900 },
		{ label: "7d", ms: 7 * DAY_MS, bucketSeconds: 3600 },
		{ label: "30d", ms: 30 * DAY_MS, bucketSeconds: 21_600 },
	];

	const cases: Case[] = [];

	for (const range of ranges) {
		const since = ts(now - range.ms);

		cases.push({
			name: `dashboard summary ${range.label}`,
			statement: `
				SELECT
					count(*)::int,
					(count(*) FILTER (WHERE cr.status = 'up'))::int,
					(round(avg(cr.latency_ms) FILTER (WHERE cr.status = 'up')))::int
				FROM app.check_results cr
				INNER JOIN app.monitors m ON m.id = cr.monitor_id
				WHERE m.deleted_at IS NULL AND cr.checked_at >= ${since}`,
		});

		cases.push({
			name: `dashboard trend ${range.label}`,
			statement: `
				SELECT
					floor(extract(epoch FROM cr.checked_at) / ${range.bucketSeconds})::int AS bucket,
					count(*)::int,
					(count(*) FILTER (WHERE cr.status = 'up'))::int,
					(round(avg(cr.latency_ms) FILTER (WHERE cr.status = 'up')))::int
				FROM app.check_results cr
				INNER JOIN app.monitors m ON m.id = cr.monitor_id
				WHERE m.deleted_at IS NULL AND cr.checked_at >= ${since}
				GROUP BY 1
				ORDER BY 1`,
		});

		cases.push({
			name: `dashboard incident stats (${range.label} bounds)`,
			statement: `
				SELECT
					(count(*) FILTER (WHERE i.resolved_at IS NULL))::int,
					(count(*) FILTER (WHERE i.started_at >= ${since}))::int,
					(count(*) FILTER (WHERE i.resolved_at >= ${since}))::int
				FROM app.incidents i
				INNER JOIN app.monitors m ON m.id = i.monitor_id
				WHERE m.deleted_at IS NULL`,
		});
	}

	// Alternative shape: one aggregate per monitor, then combined. Tests whether
	// the join shape matters before considering a new index.
	cases.push({
		name: "dashboard summary 30d, per-monitor pre-aggregate",
		statement: `
			SELECT
				sum(t.total)::int,
				sum(t.ok)::int,
				(round(sum(t.latency_sum) / NULLIF(sum(t.ok_with_latency), 0)))::int
			FROM app.monitors m
			CROSS JOIN LATERAL (
				SELECT
					count(*) AS total,
					count(*) FILTER (WHERE cr.status = 'up') AS ok,
					sum(cr.latency_ms) FILTER (WHERE cr.status = 'up') AS latency_sum,
					count(cr.latency_ms) FILTER (WHERE cr.status = 'up') AS ok_with_latency
				FROM app.check_results cr
				WHERE cr.monitor_id = m.id AND cr.checked_at >= ${ts(now - 30 * DAY_MS)}
			) t
			WHERE m.deleted_at IS NULL`,
	});

	cases.push({
		name: "last check times (old: full scan with max)",
		statement: `
			SELECT cr.monitor_id, max(cr.checked_at)
			FROM app.check_results cr
			INNER JOIN app.monitors m ON m.id = cr.monitor_id
			WHERE m.deleted_at IS NULL
			GROUP BY cr.monitor_id`,
	});

	cases.push({
		name: "last check times (new: lateral per monitor)",
		statement: `
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
			WHERE m.deleted_at IS NULL`,
	});

	return cases;
}

function monitorCases(label: string, monitorId: string, now: number): Case[] {
	const id = uuid(monitorId);
	const start90 = ts(now - 90 * DAY_MS);
	const start24 = ts(now - DAY_MS);
	const end = ts(now);

	return [
		{
			name: `${label}: monitor lookup`,
			statement: `
				SELECT id, enabled, interval_seconds, updated_at
				FROM app.monitors
				WHERE id = ${id} AND deleted_at IS NULL
				LIMIT 1`,
		},
		{
			name: `${label}: summary 24h`,
			statement: `
				SELECT
					count(*)::int,
					(count(*) FILTER (WHERE status = 'up'))::int,
					(round(avg(latency_ms) FILTER (WHERE status = 'up')))::int
				FROM app.check_results
				WHERE monitor_id = ${id} AND checked_at >= ${start24} AND checked_at <= ${end}`,
		},
		{
			name: `${label}: summary 90d`,
			statement: `
				SELECT
					count(*)::int,
					(count(*) FILTER (WHERE status = 'up'))::int,
					(round(avg(latency_ms) FILTER (WHERE status = 'up')))::int
				FROM app.check_results
				WHERE monitor_id = ${id} AND checked_at >= ${start90} AND checked_at <= ${end}`,
		},
		{
			name: `${label}: buckets 90d`,
			statement: `
				SELECT
					floor(extract(epoch FROM checked_at) / 21600)::int AS bucket,
					count(*)::int,
					(count(*) FILTER (WHERE status = 'up'))::int,
					(round(avg(latency_ms) FILTER (WHERE status = 'up')))::int
				FROM app.check_results
				WHERE monitor_id = ${id} AND checked_at >= ${start90} AND checked_at <= ${end}
				GROUP BY 1
				ORDER BY 1`,
		},
		{
			name: `${label}: history of 50`,
			statement: `
				SELECT id, checked_at, status, http_status, latency_ms, error_message
				FROM app.check_results
				WHERE monitor_id = ${id}
				ORDER BY checked_at DESC
				LIMIT 50`,
		},
		{
			name: `${label}: latest check`,
			statement: `
				SELECT status, checked_at
				FROM app.check_results
				WHERE monitor_id = ${id}
				ORDER BY checked_at DESC
				LIMIT 1`,
		},
		{
			name: `${label}: last success`,
			statement: `
				SELECT checked_at
				FROM app.check_results
				WHERE monitor_id = ${id} AND status = 'up'
				ORDER BY checked_at DESC
				LIMIT 1`,
		},
		{
			name: `${label}: last incident`,
			statement: `
				SELECT id, started_at, resolved_at, reason
				FROM app.incidents
				WHERE monitor_id = ${id}
				ORDER BY started_at DESC
				LIMIT 1`,
		},
	];
}

function incidentOverviewCases(now: number): Case[] {
	const since30 = ts(now - 30 * DAY_MS);
	const listBase = `
		SELECT i.id, i.monitor_id, m.name, m.url, p.name, i.started_at, i.resolved_at, i.reason
		FROM app.incidents i
		INNER JOIN app.monitors m ON i.monitor_id = m.id
		LEFT JOIN app.projects p ON m.project_id = p.id`;

	return [
		{
			name: "incidents list (all)",
			statement: `${listBase}
				WHERE m.deleted_at IS NULL
				ORDER BY i.started_at DESC
				LIMIT 100`,
		},
		{
			name: "incidents list (30d)",
			statement: `${listBase}
				WHERE m.deleted_at IS NULL AND i.started_at >= ${since30}
				ORDER BY i.started_at DESC
				LIMIT 100`,
		},
		{
			name: "incidents list (open only)",
			statement: `${listBase}
				WHERE m.deleted_at IS NULL AND i.resolved_at IS NULL
				ORDER BY i.started_at DESC
				LIMIT 100`,
		},
		{
			name: "incidents stats (all)",
			statement: `
				SELECT
					count(*)::int,
					(count(*) FILTER (WHERE i.resolved_at IS NULL))::int,
					(count(*) FILTER (WHERE i.resolved_at IS NOT NULL))::int,
					(avg(extract(epoch FROM (i.resolved_at - i.started_at)) * 1000)
						FILTER (WHERE i.resolved_at IS NOT NULL))::float8
				FROM app.incidents i
				INNER JOIN app.monitors m ON i.monitor_id = m.id
				WHERE m.deleted_at IS NULL`,
		},
		{
			name: "incidents monitor options",
			statement: `
				SELECT id, name FROM app.monitors
				WHERE deleted_at IS NULL
				ORDER BY name ASC`,
		},
	];
}

function incidentDetailCases(
	label: string,
	incidentId: string,
	monitorId: string,
	startedAt: string,
	resolvedAt: string | null,
): Case[] {
	const mid = uuid(monitorId);
	const started = `${lit(startedAt)}::timestamptz`;
	const duringScope = resolvedAt
		? `monitor_id = ${mid} AND checked_at >= ${started} AND checked_at < ${lit(resolvedAt)}::timestamptz`
		: `monitor_id = ${mid} AND checked_at >= ${started}`;

	const cases: Case[] = [
		{
			name: `${label}: incident lookup`,
			statement: `
				SELECT i.id, i.monitor_id, m.name, m.url, m.enabled, m.failure_threshold,
					m.recovery_threshold, p.id, p.name, i.started_at, i.resolved_at, i.reason
				FROM app.incidents i
				INNER JOIN app.monitors m ON i.monitor_id = m.id
				LEFT JOIN app.projects p ON m.project_id = p.id
				WHERE i.id = ${uuid(incidentId)} AND m.deleted_at IS NULL
				LIMIT 1`,
		},
		{
			name: `${label}: during checks (limit 100)`,
			statement: `
				SELECT id, checked_at, status, http_status, latency_ms, error_message
				FROM app.check_results
				WHERE ${duringScope}
				ORDER BY checked_at ASC
				LIMIT 100`,
		},
		{
			name: `${label}: during counts`,
			statement: `
				SELECT count(*)::int, (count(*) FILTER (WHERE status <> 'up'))::int
				FROM app.check_results
				WHERE ${duringScope}`,
		},
	];

	if (resolvedAt) {
		cases.push({
			name: `${label}: recovery checks`,
			statement: `
				SELECT id, checked_at, status, http_status, latency_ms, error_message
				FROM app.check_results
				WHERE monitor_id = ${mid} AND checked_at >= ${lit(resolvedAt)}::timestamptz
				ORDER BY checked_at ASC
				LIMIT 5`,
		});
	}

	return cases;
}

function projectCases(now: number, projectId: string): Case[] {
	const since = ts(now - DAY_MS);
	const pid = uuid(projectId);

	return [
		{
			name: "projects list (24h health)",
			statement: `
				SELECT
					p.id, p.name, p.created_at, p.updated_at,
					count(DISTINCT m.id)::int,
					(count(DISTINCT m.id) FILTER (WHERE m.enabled))::int,
					count(cr.id)::int,
					(count(cr.id) FILTER (WHERE cr.status = 'up'))::int,
					(round(avg(cr.latency_ms) FILTER (WHERE cr.status = 'up')))::int
				FROM app.projects p
				LEFT JOIN app.monitors m ON m.project_id = p.id AND m.deleted_at IS NULL
				LEFT JOIN app.check_results cr ON cr.monitor_id = m.id AND cr.checked_at >= ${since}
				GROUP BY p.id
				ORDER BY p.created_at ASC`,
		},
		{
			name: "projects open incidents",
			statement: `
				SELECT m.project_id, count(*)::int
				FROM app.incidents i
				INNER JOIN app.monitors m ON i.monitor_id = m.id
				WHERE i.resolved_at IS NULL AND m.deleted_at IS NULL AND m.project_id IS NOT NULL
				GROUP BY m.project_id`,
		},
		{
			name: "project detail: monitors",
			statement: `
				SELECT m.id, m.name, m.url, m.enabled, m.interval_seconds, m.timeout_ms,
					m.created_at, m.updated_at, i.started_at, i.reason
				FROM app.monitors m
				LEFT JOIN app.incidents i ON i.monitor_id = m.id AND i.resolved_at IS NULL
				WHERE m.project_id = ${pid} AND m.deleted_at IS NULL
				ORDER BY m.created_at ASC`,
		},
		{
			name: "project detail: 24h health",
			statement: `
				SELECT
					count(*)::int,
					(count(*) FILTER (WHERE cr.status = 'up'))::int,
					(round(avg(cr.latency_ms) FILTER (WHERE cr.status = 'up')))::int
				FROM app.check_results cr
				INNER JOIN app.monitors m ON cr.monitor_id = m.id
				WHERE m.project_id = ${pid} AND m.deleted_at IS NULL AND cr.checked_at >= ${since}`,
		},
	];
}

async function explainAsUser(userId: string, item: Case): Promise<Result> {
	const run = () =>
		asUser(userId, async (tx) => {
			const result = await tx.execute<{ "QUERY PLAN": string }>(
				sql.raw(`EXPLAIN (ANALYZE, BUFFERS) ${item.statement}`),
			);

			return result.rows.map((row) => row["QUERY PLAN"]);
		});

	// The first run warms the cache; the second is the one recorded
	await run();

	return { name: item.name, plan: await run() };
}

async function explainLeaseQueries(): Promise<Result[]> {
	const owner = lit("perf-explain");
	const statements: Case[] = [
		{
			name: "worker: ensure lease rows",
			statement: `
				INSERT INTO app.monitor_leases (monitor_id)
				SELECT m.id
				FROM app.monitors AS m
				WHERE m.enabled = true AND m.deleted_at IS NULL
				ON CONFLICT (monitor_id) DO NOTHING`,
		},
		{
			name: "worker: claim due monitors",
			statement: `
				WITH due AS (
					SELECT l.monitor_id
					FROM app.monitor_leases AS l
					JOIN app.monitors AS m ON m.id = l.monitor_id
					WHERE m.enabled = true
						AND m.deleted_at IS NULL
						AND (l.lease_until IS NULL OR l.lease_until <= now())
						AND (
							l.last_started_at IS NULL
							OR l.last_started_at
								+ make_interval(secs => GREATEST(m.interval_seconds, 1)::double precision)
								<= now()
						)
					ORDER BY
						l.last_started_at
							+ make_interval(secs => GREATEST(m.interval_seconds, 1)::double precision)
							ASC NULLS FIRST
					LIMIT 10
					FOR UPDATE OF l SKIP LOCKED
				)
				UPDATE app.monitor_leases AS l
				SET lease_owner = ${owner},
					lease_until = now() + make_interval(secs => 90::double precision)
				FROM due
				WHERE l.monitor_id = due.monitor_id
				RETURNING l.monitor_id`,
		},
	];

	const results: Result[] = [];

	// Always rolled back, so nothing the explain runs changes
	try {
		await workerDb.transaction(async (tx) => {
			for (const item of statements) {
				const result = await tx.execute<{ "QUERY PLAN": string }>(
					sql.raw(`EXPLAIN (ANALYZE, BUFFERS) ${item.statement}`),
				);

				results.push({
					name: item.name,
					plan: result.rows.map((row) => row["QUERY PLAN"]),
				});
			}

			throw new Rollback();
		});
	} catch (error) {
		if (!(error instanceof Rollback)) {
			throw error;
		}
	}

	return results;
}

function summarize(result: Result): string {
	const time = result.plan
		.find((line) => line.startsWith("Execution Time:"))
		?.replace("Execution Time:", "")
		.trim();
	const buffers = result.plan
		.find((line) => line.trim().startsWith("Buffers:"))
		?.trim()
		.replace("Buffers: ", "");

	return `${result.name.padEnd(52)} ${(time ?? "?").padStart(12)}   ${buffers ?? ""}`;
}

async function main(): Promise<void> {
	assertSafeEnvironment();

	const [perfUser] = await db
		.select({ id: user.id })
		.from(user)
		.where(like(user.id, `${PERF_USER_PREFIX}%`))
		.limit(1);

	if (!perfUser) {
		throw new Error("No perf user found. Run `npm run perf:seed` first.");
	}

	const userId = perfUser.id;
	const now = Date.now();

	await ensureOutageMonitor(userId, now);

	const busyId = await requireId(
		userId,
		`SELECT id FROM app.monitors WHERE name = ${lit(BUSY_MONITOR_NAME)} LIMIT 1`,
		BUSY_MONITOR_NAME,
	);
	const outageId = await requireId(
		userId,
		`SELECT id FROM app.monitors WHERE name = ${lit(OUTAGE_MONITOR_NAME)} LIMIT 1`,
		OUTAGE_MONITOR_NAME,
	);
	const projectId = await requireId(
		userId,
		"SELECT id FROM app.projects ORDER BY created_at ASC LIMIT 1",
		"a project",
	);

	type IncidentRow = {
		id: string;
		monitor_id: string;
		started_at: string;
		resolved_at: string | null;
	};

	const incidentColumns =
		"id, monitor_id, started_at::text AS started_at, resolved_at::text AS resolved_at";

	const [openOutage] = await rowsAs<IncidentRow>(
		userId,
		`SELECT ${incidentColumns} FROM app.incidents
		 WHERE monitor_id = ${uuid(outageId)} AND resolved_at IS NULL LIMIT 1`,
	);
	const [resolvedBusy] = await rowsAs<IncidentRow>(
		userId,
		`SELECT ${incidentColumns} FROM app.incidents
		 WHERE monitor_id = ${uuid(busyId)} AND resolved_at IS NOT NULL
		 ORDER BY started_at LIMIT 1`,
	);

	if (!openOutage || !resolvedBusy) {
		throw new Error("Expected incidents were not found");
	}

	const cases: Case[] = [
		...dashboardCases(now),
		...monitorCases("busy monitor", busyId, now),
		...monitorCases("long-outage monitor", outageId, now),
		...incidentOverviewCases(now),
		...incidentDetailCases(
			"resolved incident",
			resolvedBusy.id,
			resolvedBusy.monitor_id,
			resolvedBusy.started_at,
			resolvedBusy.resolved_at,
		),
		...incidentDetailCases(
			"60-day open incident",
			openOutage.id,
			openOutage.monitor_id,
			openOutage.started_at,
			null,
		),
		...projectCases(now, projectId),
	];

	const results: Result[] = [];

	for (const item of cases) {
		results.push(await explainAsUser(userId, item));
	}

	results.push(...(await explainLeaseQueries()));

	const header = `${"Name".padEnd(52)} ${"Exec time".padStart(12)}   Buffers (root node)`;
	const summary = [header, ...results.map(summarize)].join("\n");

	const full = results
		.map((result) => `=== ${result.name} ===\n${result.plan.join("\n")}`)
		.join("\n\n");

	await writeFile(OUTPUT_FILE, `${summary}\n\n${full}\n`, "utf8");

	console.info(summary);
	console.info(`\nFull plans written to ${OUTPUT_FILE}`);
}

main()
	.catch((error: unknown) => {
		console.error("Perf explain failed:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await Promise.all([closeDb(), closeWorkerDb()]);
	});
