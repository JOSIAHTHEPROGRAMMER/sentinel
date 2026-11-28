import { randomUUID } from "node:crypto";
import { count, inArray, like, sql } from "drizzle-orm";
import { closeDb, db } from "../src/lib/db";
import {
	checkResults,
	incidents,
	monitorLeases,
	monitors,
	projects,
} from "../src/lib/db/schema/app";
import { user } from "../src/lib/db/schema/auth";
import { closeWorkerDb, workerDb } from "../src/lib/db/worker";

const PERF_USER_PREFIX = "perf-";

type Profile = {
	label: string;
	monitorCount: number;
	projectCount: number;
	intervalMixSeconds: number[];
	deletedIndexes: Set<number>;
};

// standard: average 4,320 checks per monitor over 90 days, about 216,000 rows.
// heavy: 60 second monitors, 129,600 checks each, about 1.3M rows, which
// models a user whose dashboard windows read far more rows per monitor.
const PROFILES: Record<"standard" | "heavy", Profile> = {
	standard: {
		label: "standard",
		monitorCount: 50,
		projectCount: 4,
		intervalMixSeconds: [900, 1800, 1800, 3600, 3600],
		deletedIndexes: new Set([2, 24]),
	},
	heavy: {
		label: "heavy",
		monitorCount: 10,
		projectCount: 2,
		intervalMixSeconds: [60],
		deletedIndexes: new Set([2]),
	},
};

const HISTORY_DAYS = 90;
const TIMEOUT_MS = 10_000;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const DAY_SECONDS = 86_400;

// Outage lengths in minutes, converted to a number of checks per monitor
const OUTAGE_MINUTES = [5, 10, 20, 45, 90, 240];

type FailureKind = "down" | "timeout" | "error";

type OutageWindow = {
	first: number;
	last: number;
	kind: FailureKind;
	httpStatus: number | null;
};

type MonitorPlan = {
	index: number;
	name: string;
	intervalSeconds: number;
	count: number;
	baseLatencyMs: number;
	failureThreshold: number;
	recoveryThreshold: number;
	blipRate: number;
	hasOpenIncident: boolean;
	resolvedTarget: number;
	disabled: boolean;
	deleted: boolean;
	projectSlot: number | null;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function asUser<T>(
	userId: string,
	run: (tx: Transaction) => Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		return run(tx);
	});
}

function assertSafeEnvironment(): void {
	if (process.env.ALLOW_INTEGRATION_TESTS !== "true") {
		throw new Error("Refusing to run: ALLOW_INTEGRATION_TESTS is not true");
	}

	if (process.env.NODE_ENV === "production") {
		throw new Error("Refusing to run with NODE_ENV=production");
	}
}

function createRandom(seed: number): () => number {
	let state = seed >>> 0;

	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function planMonitor(index: number, profile: Profile): MonitorPlan {
	const intervalSeconds =
		profile.intervalMixSeconds[index % profile.intervalMixSeconds.length] ??
		3600;
	const failureThreshold = index % 3 === 0 ? 2 : 1;
	const hasOpenIncident = index % 12 === 5;
	const deleted = profile.deletedIndexes.has(index);
	const projectSlot = index % (profile.projectCount + 1);

	return {
		index,
		name: `Perf monitor ${String(index + 1).padStart(2, "0")}`,
		intervalSeconds,
		count: Math.floor((HISTORY_DAYS * DAY_SECONDS) / intervalSeconds),
		baseLatencyMs: 90 + ((index * 37) % 500),
		failureThreshold,
		recoveryThreshold: index % 4 === 0 ? 2 : 1,
		// Isolated blips only make sense where one failure does not open an incident
		blipRate: failureThreshold >= 2 ? 0.003 : 0,
		hasOpenIncident,
		resolvedTarget: 1 + (index % 5),
		disabled: !hasOpenIncident && !deleted && index % 10 === 9,
		deleted,
		projectSlot: projectSlot === profile.projectCount ? null : projectSlot,
	};
}

function pickFailure(random: () => number): {
	kind: FailureKind;
	httpStatus: number | null;
} {
	const roll = random();

	if (roll < 0.5) {
		return {
			kind: "down",
			httpStatus: roll < 0.3 ? 503 : roll < 0.4 ? 500 : 502,
		};
	}

	if (roll < 0.8) {
		return { kind: "timeout", httpStatus: null };
	}

	return { kind: "error", httpStatus: null };
}

// Outage windows are index ranges on the monitor's check grid, so the incident
// rows can be back-dated to the first failing check and resolved at the first
// successful check, the same way the real lifecycle does it.
function buildWindows(plan: MonitorPlan, random: () => number): OutageWindow[] {
	const slots = plan.resolvedTarget + (plan.hasOpenIncident ? 1 : 0);
	const segment = Math.floor((plan.count - 20) / slots);
	const windows: OutageWindow[] = [];

	for (let slot = 0; slot < slots; slot++) {
		const segmentStart = 10 + slot * segment;
		const failure = pickFailure(random);

		if (plan.hasOpenIncident && slot === slots - 1) {
			const length = plan.failureThreshold + 2 + Math.floor(random() * 10);

			windows.push({
				first: plan.count - length,
				last: plan.count - 1,
				...failure,
			});
			continue;
		}

		const minutes =
			OUTAGE_MINUTES[Math.floor(random() * OUTAGE_MINUTES.length)] ?? 10;
		const maxLength = Math.floor(segment / 2) - 1;
		const length = Math.min(
			maxLength,
			Math.max(
				plan.failureThreshold,
				Math.ceil((minutes * 60) / plan.intervalSeconds),
			),
		);
		const first = segmentStart + Math.floor(random() * (segment / 2 - 1));

		windows.push({ first, last: first + length - 1, ...failure });
	}

	return windows;
}

function checkTime(plan: MonitorPlan, anchorMs: number, index: number): Date {
	return new Date(
		anchorMs - (plan.count - 1 - index) * plan.intervalSeconds * 1000,
	);
}

function incidentReason(window: OutageWindow): string {
	if (window.kind === "down") {
		return `HTTP ${window.httpStatus}`;
	}

	return window.kind === "timeout" ? "Request timed out" : "Connection refused";
}

function insertChecksSql(
	plan: MonitorPlan,
	monitorId: string,
	anchorIso: string,
	windows: OutageWindow[],
) {
	const windowRows =
		windows.length > 0
			? windows.map(
					(window) =>
						sql`(${window.first}::int, ${window.last}::int, ${window.kind}::text, ${window.httpStatus}::int)`,
				)
			: [sql`(NULL::int, NULL::int, NULL::text, NULL::int)`];

	return sql`
		WITH s AS MATERIALIZED (
			SELECT
				g.i AS i,
				COALESCE(
					w.kind,
					CASE
						WHEN ${plan.blipRate}::float8 > 0
							AND random() < ${plan.blipRate}::float8
						THEN 'timeout'
					END,
					'up'
				) AS kind,
				w.http_status AS http_status
			FROM generate_series(0, ${plan.count}::int - 1) AS g(i)
			LEFT JOIN (VALUES ${sql.join(windowRows, sql`, `)})
				AS w(first_i, last_i, kind, http_status)
				ON g.i BETWEEN w.first_i AND w.last_i
		)
		INSERT INTO app.check_results
			(monitor_id, checked_at, status, http_status, latency_ms, error_message)
		SELECT
			${monitorId}::uuid,
			${anchorIso}::timestamptz
				- ((${plan.count}::int - 1 - s.i) * ${plan.intervalSeconds}::int)
				* interval '1 second',
			s.kind::app.check_status,
			CASE WHEN s.kind = 'up' THEN 200 ELSE s.http_status END,
			CASE s.kind
				WHEN 'up' THEN LEAST(
					${TIMEOUT_MS}::int - 1,
					GREATEST(
						20,
						round(
							${plan.baseLatencyMs}::float8
							* (1 + 0.3 * s.i::float8 / ${plan.count}::float8)
							* (1 + 0.2 * sin(2 * pi() * s.i::float8 * ${plan.intervalSeconds}::float8 / 86400.0))
							* (0.8 + 0.4 * random())
							* (CASE WHEN random() < 0.01 THEN 4 ELSE 1 END)
						)::int
					)
				)
				WHEN 'down' THEN 30 + floor(random() * 370)::int
				WHEN 'timeout' THEN ${TIMEOUT_MS}::int
				ELSE NULL
			END,
			CASE s.kind
				WHEN 'up' THEN NULL
				WHEN 'down' THEN 'HTTP ' || s.http_status
				WHEN 'timeout' THEN 'Request timed out'
				ELSE 'Connection refused'
			END
		FROM s
	`;
}

async function seed(profile: Profile): Promise<void> {
	assertSafeEnvironment();

	const [existing] = await db
		.select({ id: user.id })
		.from(user)
		.where(like(user.id, `${PERF_USER_PREFIX}%`))
		.limit(1);

	if (existing) {
		throw new Error(
			"A perf user already exists. Run `npm run perf:cleanup` first.",
		);
	}

	const plans = Array.from({ length: profile.monitorCount }, (_, index) =>
		planMonitor(index, profile),
	);
	const expectedChecks = plans.reduce((total, plan) => total + plan.count, 0);

	console.info(
		`Profile ${profile.label}: seeding ${plans.length} monitors, about ${expectedChecks} check rows over ${HISTORY_DAYS} days.`,
	);

	const now = Date.now();
	const anchorMs = now - 30_000;
	const anchorIso = new Date(anchorMs).toISOString();
	const userId = `${PERF_USER_PREFIX}${randomUUID()}`;

	await db.insert(user).values({
		id: userId,
		name: "Perf user",
		email: `${userId}@perf.test`,
	});

	const projectRows = await asUser(userId, (tx) =>
		tx
			.insert(projects)
			.values(
				Array.from({ length: profile.projectCount }, (_, index) => ({
					ownerId: userId,
					name: `Perf project ${index + 1}`,
				})),
			)
			.returning({ id: projects.id, name: projects.name }),
	);
	const projectByName = new Map(projectRows.map((row) => [row.name, row.id]));

	// Created enabled because the worker role may only write for enabled monitors
	const createdMonitors = await asUser(userId, (tx) =>
		tx
			.insert(monitors)
			.values(
				plans.map((plan) => ({
					ownerId: userId,
					projectId:
						plan.projectSlot === null
							? null
							: (projectByName.get(`Perf project ${plan.projectSlot + 1}`) ??
								null),
					name: plan.name,
					url: `https://perf-${plan.index + 1}.invalid/health`,
					intervalSeconds: plan.intervalSeconds,
					timeoutMs: TIMEOUT_MS,
					failureThreshold: plan.failureThreshold,
					recoveryThreshold: plan.recoveryThreshold,
					enabled: true,
					createdAt: new Date(now - (HISTORY_DAYS + 1) * DAY_MS),
				})),
			)
			.returning({ id: monitors.id, name: monitors.name }),
	);
	const idByName = new Map(createdMonitors.map((row) => [row.name, row.id]));

	let incidentTotal = 0;

	for (const plan of plans) {
		const monitorId = idByName.get(plan.name);

		if (!monitorId) {
			throw new Error(`Monitor was not created: ${plan.name}`);
		}

		const windows = buildWindows(plan, createRandom(1000 + plan.index));

		await workerDb.transaction(async (tx) => {
			// Dated an hour ahead so a running worker never claims these monitors
			await tx
				.insert(monitorLeases)
				.values({ monitorId, lastStartedAt: new Date(now + HOUR_MS) });

			await tx.execute(insertChecksSql(plan, monitorId, anchorIso, windows));

			if (windows.length > 0) {
				await tx.insert(incidents).values(
					windows.map((window) => ({
						monitorId,
						startedAt: checkTime(plan, anchorMs, window.first),
						resolvedAt:
							window.last === plan.count - 1
								? null
								: checkTime(plan, anchorMs, window.last + 1),
						reason: incidentReason(window),
					})),
				);
			}
		});

		incidentTotal += windows.length;

		if (plans.length <= 10 || (plan.index + 1) % 10 === 0) {
			console.info(`Seeded ${plan.index + 1} of ${plans.length} monitors`);
		}
	}

	const disabledIds = plans
		.filter((plan) => plan.disabled)
		.flatMap((plan) => idByName.get(plan.name) ?? []);
	const deletedIds = plans
		.filter((plan) => plan.deleted)
		.flatMap((plan) => idByName.get(plan.name) ?? []);

	await asUser(userId, async (tx) => {
		if (disabledIds.length > 0) {
			await tx
				.update(monitors)
				.set({ enabled: false })
				.where(inArray(monitors.id, disabledIds));
		}

		if (deletedIds.length > 0) {
			await tx
				.update(monitors)
				.set({ enabled: false, deletedAt: new Date(now) })
				.where(inArray(monitors.id, deletedIds));
		}
	});

	const report = await asUser(userId, async (tx) => {
		const [checkCount] = await tx.select({ total: count() }).from(checkResults);
		const [incidentCount] = await tx.select({ total: count() }).from(incidents);
		const sizeResult = await tx.execute<{
			checkTable: string;
			checkIndexes: string;
			database: string;
		}>(sql`
			SELECT
				pg_size_pretty(pg_total_relation_size('app.check_results')) AS "checkTable",
				pg_size_pretty(pg_indexes_size('app.check_results')) AS "checkIndexes",
				pg_size_pretty(pg_database_size(current_database())) AS "database"
		`);
		const sizes = sizeResult.rows[0];

		return { checkCount, incidentCount, sizes };
	});

	console.info("Perf seed completed.");
	console.info(`User: ${userId}`);
	console.info(`Monitors: ${plans.length}`);
	console.info(
		`Disabled: ${disabledIds.length}, soft-deleted: ${deletedIds.length}`,
	);
	console.info(`Check results: ${report.checkCount?.total}`);
	console.info(
		`Incidents: ${report.incidentCount?.total} (planned ${incidentTotal})`,
	);
	console.info(`check_results total size: ${report.sizes?.checkTable}`);
	console.info(`check_results indexes: ${report.sizes?.checkIndexes}`);
	console.info(`Database size: ${report.sizes?.database}`);
	console.info("Remove everything with: npm run perf:cleanup");
}

async function cleanup(): Promise<void> {
	assertSafeEnvironment();

	const deleted = await db
		.delete(user)
		.where(like(user.id, `${PERF_USER_PREFIX}%`))
		.returning({ id: user.id });

	console.info(`Deleted ${deleted.length} perf user(s) and their data.`);
}

const run = process.argv.includes("--cleanup")
	? cleanup
	: () =>
			seed(
				process.argv.includes("--heavy") ? PROFILES.heavy : PROFILES.standard,
			);

run()
	.catch((error: unknown) => {
		console.error("Perf script failed:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await Promise.all([closeDb(), closeWorkerDb()]);
	});
