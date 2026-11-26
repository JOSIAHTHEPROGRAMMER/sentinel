import { randomUUID } from "node:crypto";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

export const E2E_EMAIL_DOMAIN = "sentinel-e2e.test";

const MINUTE = 60_000;

export type SeedMonitor = {
	name: string;
	enabled?: boolean;
	checks?: {
		minutesAgo: number;
		status: "up" | "down" | "timeout" | "error";
		latencyMs?: number | null;
		httpStatus?: number | null;
	}[];
	incidents?: {
		startedMinutesAgo: number;
		resolvedMinutesAgo?: number | null;
		reason: string;
	}[];
};

export type SeededMonitor = {
	id: string;
	name: string;
	incidentIds: string[];
};

let appPool: Pool | undefined;
let workerPool: Pool | undefined;

function requireEnv(name: string): string {
	const value = process.env[name];

	if (!value) {
		throw new Error(`${name} is not set`);
	}

	return value;
}

function getAppPool(): Pool {
	appPool ??= new Pool({ connectionString: requireEnv("DATABASE_URL") });

	return appPool;
}

function getWorkerPool(): Pool {
	workerPool ??= new Pool({
		connectionString: requireEnv("MONITOR_WORKER_DATABASE_URL"),
	});

	return workerPool;
}

export function newE2eEmail(): string {
	return `e2e-${randomUUID()}@${E2E_EMAIL_DOMAIN}`;
}

export async function deleteE2eUsers(): Promise<void> {
	// Cascades remove monitors, checks, incidents, projects, settings and leases
	await getAppPool().query(`DELETE FROM auth."user" WHERE email LIKE $1`, [
		`%@${E2E_EMAIL_DOMAIN}`,
	]);
}

export async function closePools(): Promise<void> {
	await Promise.all([appPool?.end(), workerPool?.end()]);
	appPool = undefined;
	workerPool = undefined;
}

// Attaches data to an account that was created through the real sign-up page
export async function seedForEmail(
	email: string,
	monitorSpecs: SeedMonitor[],
): Promise<SeededMonitor[]> {
	const now = Date.now();
	const seeded: SeededMonitor[] = [];
	let userId = "";

	// Monitors are created enabled, because the worker role may only write for
	// enabled monitors. Leases dated ahead keep a running worker away from them
	const appClient = await getAppPool().connect();

	try {
		await appClient.query("BEGIN");

		const found = await appClient.query<{ id: string }>(
			`SELECT id FROM auth."user" WHERE email = $1`,
			[email],
		);
		const id = found.rows[0]?.id;

		if (!id) {
			throw new Error(`No account found for ${email}`);
		}

		userId = id;
		await appClient.query("SELECT set_config('app.user_id', $1, true)", [
			userId,
		]);

		for (const spec of monitorSpecs) {
			const created = await appClient.query<{ id: string }>(
				`INSERT INTO app.monitors (owner_id, name, url, interval_seconds, enabled)
				 VALUES ($1, $2, 'https://e2e.invalid/health', 86400, true)
				 RETURNING id`,
				[userId, spec.name],
			);
			const monitorId = created.rows[0]?.id ?? "";

			seeded.push({ id: monitorId, name: spec.name, incidentIds: [] });
		}

		await appClient.query("COMMIT");
	} catch (error) {
		await appClient.query("ROLLBACK");
		throw error;
	} finally {
		appClient.release();
	}

	const workerClient = await getWorkerPool().connect();

	try {
		await workerClient.query("BEGIN");

		for (const [index, spec] of monitorSpecs.entries()) {
			const target = seeded[index];

			if (!target) {
				continue;
			}

			await workerClient.query(
				`INSERT INTO app.monitor_leases (monitor_id, last_started_at)
				 VALUES ($1, $2)`,
				[target.id, new Date(now + 60 * MINUTE)],
			);

			for (const check of spec.checks ?? []) {
				await workerClient.query(
					`INSERT INTO app.check_results
					   (monitor_id, checked_at, status, http_status, latency_ms, error_message)
					 VALUES ($1, $2, $3, $4, $5, $6)`,
					[
						target.id,
						new Date(now - check.minutesAgo * MINUTE),
						check.status,
						check.httpStatus === undefined
							? check.status === "up"
								? 200
								: null
							: check.httpStatus,
						check.latencyMs === undefined ? 100 : check.latencyMs,
						check.status === "up" ? null : `Seeded ${check.status}`,
					],
				);
			}

			for (const incident of spec.incidents ?? []) {
				const created = await workerClient.query<{ id: string }>(
					`INSERT INTO app.incidents (monitor_id, started_at, resolved_at, reason)
					 VALUES ($1, $2, $3, $4)
					 RETURNING id`,
					[
						target.id,
						new Date(now - incident.startedMinutesAgo * MINUTE),
						incident.resolvedMinutesAgo == null
							? null
							: new Date(now - incident.resolvedMinutesAgo * MINUTE),
						incident.reason,
					],
				);

				target.incidentIds.push(created.rows[0]?.id ?? "");
			}
		}

		await workerClient.query("COMMIT");
	} catch (error) {
		await workerClient.query("ROLLBACK");
		throw error;
	} finally {
		workerClient.release();
	}

	const toDisable = monitorSpecs
		.map((spec, index) => (spec.enabled === false ? seeded[index]?.id : null))
		.filter((id): id is string => Boolean(id));

	if (toDisable.length > 0) {
		const client = await getAppPool().connect();

		try {
			await client.query("BEGIN");
			await client.query("SELECT set_config('app.user_id', $1, true)", [
				userId,
			]);
			await client.query(
				`UPDATE app.monitors SET enabled = false WHERE id = ANY($1::uuid[])`,
				[toDisable],
			);
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}

	return seeded;
}
