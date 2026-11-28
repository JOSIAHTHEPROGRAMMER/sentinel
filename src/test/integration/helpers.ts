import { randomUUID } from "node:crypto";
import { like, sql } from "drizzle-orm";
import { Pool } from "pg";
import { closeDb, db } from "@/lib/db";
import {
	checkResults,
	incidents,
	monitorLeases,
	monitors,
	projects,
} from "@/lib/db/schema/app";
import { user } from "@/lib/db/schema/auth";
import { closeWorkerDb, workerDb } from "@/lib/db/worker";

export const TEST_USER_PREFIX = "itest-";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type SeedCheck = {
	minutesAgo: number;
	status: "up" | "down" | "timeout" | "error";
	latencyMs?: number | null;
	httpStatus?: number | null;
	errorMessage?: string | null;
};

export type SeedIncident = {
	startedMinutesAgo: number;
	resolvedMinutesAgo?: number | null;
	reason?: string;
};

export type SeedMonitorOptions = {
	name?: string;
	enabled?: boolean;
	deleted?: boolean;
	intervalSeconds?: number;
	projectId?: string | null;
	checks?: SeedCheck[];
	incidents?: SeedIncident[];
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The app and worker roles cannot write the rollup watermark, so tests that
// seed old checks use the migrator role, which owns the table
let migratorPool: Pool | undefined;

function getMigratorPool(): Pool {
	if (!migratorPool) {
		const connectionString = process.env.MIGRATION_DATABASE_URL;

		if (!connectionString) {
			throw new Error("MIGRATION_DATABASE_URL is not configured");
		}

		migratorPool = new Pool({ connectionString, max: 2 });
	}

	return migratorPool;
}

// Moves the watermark back so raw rows at or after `to` are read as raw data.
// It never moves it forward.
export async function rewindWatermark(to: Date): Promise<void> {
	await getMigratorPool().query(
		"UPDATE app.rollup_state SET rolled_through = LEAST(rolled_through, $1::timestamptz)",
		[to.toISOString()],
	);
}

export async function asUser<T>(
	userId: string,
	run: (tx: Transaction) => Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		return run(tx);
	});
}

export async function createTestUser(label = "user") {
	const id = `${TEST_USER_PREFIX}${randomUUID()}`;
	const email = `${id}@integration.test`;

	await db.insert(user).values({ id, name: `Integration ${label}`, email });

	return { id, email };
}

export async function createProject(userId: string, name = "Test project") {
	const [row] = await asUser(userId, (tx) =>
		tx
			.insert(projects)
			.values({ ownerId: userId, name })
			.returning({ id: projects.id }),
	);

	if (!row) {
		throw new Error("Could not create the test project");
	}

	return row.id;
}

export async function seedMonitor(
	userId: string,
	options: SeedMonitorOptions = {},
): Promise<string> {
	const now = Date.now();
	const checks = options.checks ?? [];
	const seededIncidents = options.incidents ?? [];

	// Created enabled because the worker role may only write for enabled monitors
	const [created] = await asUser(userId, (tx) =>
		tx
			.insert(monitors)
			.values({
				ownerId: userId,
				projectId: options.projectId ?? null,
				name: options.name ?? "Integration monitor",
				url: "https://integration.invalid/health",
				intervalSeconds: options.intervalSeconds ?? 86_400,
				enabled: true,
			})
			.returning({ id: monitors.id }),
	);

	if (!created) {
		throw new Error("Could not create the test monitor");
	}

	const monitorId = created.id;

	// Marks the monitor as just checked, so a running worker will not claim it
	// Dated an hour ahead so a running worker never claims this monitor while
	// a test is using it, whatever its interval
	await workerDb
		.insert(monitorLeases)
		.values({ monitorId, lastStartedAt: new Date(now + 60 * MINUTE) });

	if (checks.length > 0) {
		// Seeded checks may be older than the rollup watermark, which production
		// never writes behind
		const oldestMs =
			now - Math.max(...checks.map((c) => c.minutesAgo)) * MINUTE;

		await rewindWatermark(new Date(Math.floor(oldestMs / HOUR) * HOUR - HOUR));

		await workerDb.insert(checkResults).values(
			checks.map((check) => ({
				monitorId,
				checkedAt: new Date(now - check.minutesAgo * MINUTE),
				status: check.status,
				httpStatus:
					check.httpStatus === undefined
						? check.status === "up"
							? 200
							: null
						: check.httpStatus,
				latencyMs: check.latencyMs === undefined ? 100 : check.latencyMs,
				errorMessage:
					check.errorMessage === undefined
						? check.status === "up"
							? null
							: `Seeded ${check.status}`
						: check.errorMessage,
			})),
		);
	}

	if (seededIncidents.length > 0) {
		await workerDb.insert(incidents).values(
			seededIncidents.map((incident) => ({
				monitorId,
				startedAt: new Date(now - incident.startedMinutesAgo * MINUTE),
				resolvedAt:
					incident.resolvedMinutesAgo == null
						? null
						: new Date(now - incident.resolvedMinutesAgo * MINUTE),
				reason: incident.reason ?? "HTTP 503",
			})),
		);
	}

	const finalEnabled = options.enabled ?? false;

	if (!finalEnabled || options.deleted) {
		await asUser(userId, (tx) =>
			tx
				.update(monitors)
				.set({
					enabled: finalEnabled,
					deletedAt: options.deleted ? new Date(now) : null,
				})
				.where(sql`id = ${monitorId}`),
		);
	}

	return monitorId;
}

export async function cleanupTestUsers(): Promise<void> {
	await db.delete(user).where(like(user.id, `${TEST_USER_PREFIX}%`));
}

export async function closeConnections(): Promise<void> {
	await Promise.all([
		closeDb(),
		closeWorkerDb(),
		migratorPool?.end() ?? Promise.resolve(),
	]);
}
