import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkResults } from "@/lib/db/schema/app";
import { workerDb } from "@/lib/db/worker";
import {
	asUser,
	cleanupTestUsers,
	closeConnections,
	createTestUser,
	seedMonitor,
} from "./helpers";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MINUTE = 60_000;

let pool: Pool;
let savedWatermark: Date;

function hourFloor(ms: number): number {
	return Math.floor(ms / HOUR) * HOUR;
}

function errorText(error: unknown): string {
	const parts: string[] = [];
	let current: unknown = error;

	while (current instanceof Error) {
		parts.push(current.message);
		current = current.cause;
	}

	return parts.join(" | ");
}

async function expectDenied(run: () => Promise<unknown>): Promise<void> {
	let caught: unknown;

	try {
		await run();
	} catch (error) {
		caught = error;
	}

	expect(caught).toBeDefined();
	expect(errorText(caught)).toMatch(/permission denied/i);
}

async function setWatermark(ms: number): Promise<void> {
	await pool.query(
		"UPDATE app.rollup_state SET rolled_through = $1::timestamptz",
		[new Date(ms).toISOString()],
	);
}

async function getWatermark(): Promise<number> {
	const result = await pool.query<{ rolled_through: Date }>(
		"SELECT rolled_through FROM app.rollup_state",
	);

	return result.rows[0]?.rolled_through.getTime() ?? 0;
}

async function runRetention(maxHours: number, deleteBatch = 20_000) {
	const result = await workerDb.execute(
		sql`SELECT hours_rolled, rows_deleted FROM app.run_check_retention(${maxHours}::int, ${deleteBatch}::int)`,
	);
	const [row] = result.rows as Array<{
		hours_rolled: number | string;
		rows_deleted: number | string;
	}>;

	return {
		hoursRolled: Number(row?.hours_rolled ?? 0),
		rowsDeleted: Number(row?.rows_deleted ?? 0),
	};
}

async function newMonitor() {
	const { id: userId } = await createTestUser("retention");
	// Enabled, because the worker role may only write for enabled monitors
	const monitorId = await seedMonitor(userId, { enabled: true });

	return { userId, monitorId };
}

type Check = {
	at: number;
	status?: "up" | "down";
	latencyMs?: number | null;
};

async function insertChecks(monitorId: string, checks: Check[]): Promise<void> {
	await workerDb.insert(checkResults).values(
		checks.map((check) => {
			const status = check.status ?? "up";

			return {
				monitorId,
				checkedAt: new Date(check.at),
				status,
				httpStatus: status === "up" ? 200 : 500,
				latencyMs: check.latencyMs === undefined ? 100 : check.latencyMs,
				errorMessage: status === "up" ? null : "Seeded down",
			};
		}),
	);
}

async function getRollups(monitorId: string) {
	const result = await pool.query<{
		hour_start: Date;
		total: number;
		successful: number;
		latency_sum: number;
		latency_count: number;
	}>(
		"SELECT hour_start, total, successful, latency_sum, latency_count FROM app.check_rollups_hourly WHERE monitor_id = $1 ORDER BY hour_start",
		[monitorId],
	);

	return result.rows.map((row) => ({
		hour: row.hour_start.getTime(),
		total: row.total,
		successful: row.successful,
		sum: row.latency_sum,
		count: row.latency_count,
	}));
}

async function getRawTimes(monitorId: string): Promise<number[]> {
	const result = await pool.query<{ checked_at: Date }>(
		"SELECT checked_at FROM app.check_results WHERE monitor_id = $1 ORDER BY checked_at",
		[monitorId],
	);

	return result.rows.map((row) => row.checked_at.getTime());
}

beforeAll(async () => {
	const connectionString = process.env.MIGRATION_DATABASE_URL;

	if (!connectionString) {
		throw new Error("MIGRATION_DATABASE_URL is not configured");
	}

	pool = new Pool({ connectionString, max: 3 });

	const state = await pool.query<{ rolled_through: Date }>(
		"SELECT rolled_through FROM app.rollup_state",
	);
	const row = state.rows[0];

	if (!row) {
		throw new Error("app.rollup_state has no row");
	}

	savedWatermark = row.rolled_through;
});

afterAll(async () => {
	await cleanupTestUsers();
	await setWatermark(savedWatermark.getTime());
	await pool.end();
	await closeConnections();
});

describe("run_check_retention", () => {
	describe("rollup", () => {
		it("sums complete hours exactly and leaves recent raw rows alone", async () => {
			const { monitorId } = await newMonitor();
			const base = hourFloor(Date.now() - 50 * DAY);

			await insertChecks(monitorId, [
				{ at: base + 10 * MINUTE, latencyMs: 100 },
				// Up without a latency counts as successful but not in the average
				{ at: base + 20 * MINUTE, latencyMs: null },
				// A failed check's latency is never part of the average
				{ at: base + 30 * MINUTE, status: "down", latencyMs: 250 },
				{ at: base + HOUR + 10 * MINUTE, latencyMs: 300 },
			]);

			await setWatermark(base);

			const result = await runRetention(24);

			expect(result.hoursRolled).toBe(24);
			expect(await getWatermark()).toBe(base + 24 * HOUR);
			expect(await getRollups(monitorId)).toEqual([
				{ hour: base, total: 3, successful: 2, sum: 100, count: 1 },
				{ hour: base + HOUR, total: 1, successful: 1, sum: 300, count: 1 },
			]);
			expect(await getRawTimes(monitorId)).toHaveLength(4);
		});

		it("is idempotent and picks up a late row without double counting", async () => {
			const { monitorId } = await newMonitor();
			const base = hourFloor(Date.now() - 52 * DAY);

			await insertChecks(monitorId, [
				{ at: base + 5 * MINUTE },
				{ at: base + 15 * MINUTE },
			]);

			await setWatermark(base);
			await runRetention(1);

			const first = await getRollups(monitorId);

			expect(first).toEqual([
				{ hour: base, total: 2, successful: 2, sum: 200, count: 2 },
			]);

			await setWatermark(base);
			await runRetention(1);

			expect(await getRollups(monitorId)).toEqual(first);

			await insertChecks(monitorId, [{ at: base + 25 * MINUTE }]);
			await setWatermark(base);
			await runRetention(1);

			expect(await getRollups(monitorId)).toEqual([
				{ hour: base, total: 3, successful: 3, sum: 300, count: 3 },
			]);
		});
	});

	describe("pruning", () => {
		it("never deletes a raw row before its hour is rolled up", async () => {
			const { monitorId } = await newMonitor();
			const base = hourFloor(Date.now() - 100 * DAY);
			const at = base + HOUR + 10 * MINUTE;

			await insertChecks(monitorId, [{ at }]);
			await setWatermark(base);

			// No hours allowed, so nothing is rolled up and nothing may be deleted
			const idle = await runRetention(0);

			expect(idle.hoursRolled).toBe(0);
			expect(await getRawTimes(monitorId)).toEqual([at]);
			expect(await getRollups(monitorId)).toEqual([]);

			// The call that rolls the hour up is the one that may delete the row
			const rolled = await runRetention(24);

			expect(rolled.hoursRolled).toBe(24);
			expect(rolled.rowsDeleted).toBeGreaterThanOrEqual(1);
			expect(await getRawTimes(monitorId)).toEqual([]);
			expect(await getRollups(monitorId)).toEqual([
				{ hour: base + HOUR, total: 1, successful: 1, sum: 100, count: 1 },
			]);
		});

		it("deletes rows before the 90 day cutoff and keeps the rest", async () => {
			const { monitorId } = await newMonitor();
			const cutoff = hourFloor(Date.now() - 90 * DAY);

			await insertChecks(monitorId, [
				{ at: cutoff - 30 * MINUTE },
				{ at: cutoff },
				{ at: cutoff + 30 * MINUTE },
			]);

			await setWatermark(cutoff - 2 * HOUR);

			const result = await runRetention(4);

			expect(result.hoursRolled).toBe(4);
			expect(result.rowsDeleted).toBeGreaterThanOrEqual(1);
			expect(await getRawTimes(monitorId)).toEqual([
				cutoff,
				cutoff + 30 * MINUTE,
			]);
			expect(await getRollups(monitorId)).toEqual([
				{ hour: cutoff - HOUR, total: 1, successful: 1, sum: 100, count: 1 },
				{ hour: cutoff, total: 2, successful: 2, sum: 200, count: 2 },
			]);
		});

		it("stops deleting at the batch size and finishes on the next call", async () => {
			const { monitorId } = await newMonitor();
			const base = hourFloor(Date.now() - 110 * DAY);

			await insertChecks(
				monitorId,
				Array.from({ length: 5 }, (_, index) => ({
					at: base + (index + 1) * MINUTE,
				})),
			);
			await setWatermark(base);

			await runRetention(24, 2);

			expect(await getRawTimes(monitorId)).toHaveLength(3);

			// Further calls keep deleting without rolling anything twice
			for (let call = 0; call < 3; call++) {
				await runRetention(0, 2);
			}

			expect(await getRawTimes(monitorId)).toEqual([]);
			expect(await getRollups(monitorId)).toEqual([
				{ hour: base, total: 5, successful: 5, sum: 500, count: 5 },
			]);
		});
	});

	describe("rollup expiry", () => {
		it("drops rollup rows older than 400 days and keeps newer ones", async () => {
			const { monitorId } = await newMonitor();
			const old = hourFloor(Date.now() - 401 * DAY);
			const recent = hourFloor(Date.now() - 399 * DAY);

			await pool.query(
				`INSERT INTO app.check_rollups_hourly
					(monitor_id, hour_start, total, successful, latency_sum, latency_count)
				VALUES ($1, $2::timestamptz, 1, 1, 100, 1), ($1, $3::timestamptz, 1, 1, 100, 1)`,
				[
					monitorId,
					new Date(old).toISOString(),
					new Date(recent).toISOString(),
				],
			);
			await setWatermark(hourFloor(Date.now() - 120 * DAY));

			await runRetention(0);

			expect((await getRollups(monitorId)).map((row) => row.hour)).toEqual([
				recent,
			]);
		});
	});

	describe("concurrency", () => {
		it("returns zeros instead of waiting while another run holds the state row", async () => {
			const base = hourFloor(Date.now() - 55 * DAY);

			await setWatermark(base);

			const holder = await pool.connect();

			try {
				await holder.query("BEGIN");
				await holder.query(
					"SELECT 1 FROM app.rollup_state WHERE id FOR UPDATE",
				);

				const result = await runRetention(24);

				expect(result).toEqual({ hoursRolled: 0, rowsDeleted: 0 });
			} finally {
				await holder.query("ROLLBACK");
				holder.release();
			}

			expect(await getWatermark()).toBe(base);
		});
	});

	describe("role limits", () => {
		it("lets the app role read only its own rollups and the watermark", async () => {
			const owner = await newMonitor();
			const other = await newMonitor();
			const base = hourFloor(Date.now() - 56 * DAY);

			await insertChecks(owner.monitorId, [{ at: base + MINUTE }]);
			await setWatermark(base);
			await runRetention(1);

			const countFor = (userId: string, monitorId: string) =>
				asUser(userId, async (tx) => {
					const result = await tx.execute<{ n: number }>(
						sql`SELECT count(*)::int AS n FROM app.check_rollups_hourly WHERE monitor_id = ${monitorId}::uuid`,
					);

					return result.rows[0]?.n ?? 0;
				});

			expect(await countFor(owner.userId, owner.monitorId)).toBe(1);
			expect(await countFor(other.userId, owner.monitorId)).toBe(0);

			const state = await asUser(owner.userId, (tx) =>
				tx.execute<{ n: number }>(
					sql`SELECT count(*)::int AS n FROM app.rollup_state`,
				),
			);

			expect(state.rows[0]?.n).toBe(1);
		});

		it("refuses the app role the function and every write", async () => {
			const { userId, monitorId } = await newMonitor();

			await expectDenied(() =>
				asUser(userId, (tx) =>
					tx.execute(sql`SELECT * FROM app.run_check_retention()`),
				),
			);
			await expectDenied(() =>
				asUser(userId, (tx) =>
					tx.execute(
						sql`INSERT INTO app.check_rollups_hourly (monitor_id, hour_start, total, successful, latency_sum, latency_count) VALUES (${monitorId}::uuid, now(), 1, 1, 1, 1)`,
					),
				),
			);
			await expectDenied(() =>
				asUser(userId, (tx) =>
					tx.execute(sql`UPDATE app.rollup_state SET rolled_through = now()`),
				),
			);
		});

		it("refuses the worker role direct access to both tables", async () => {
			await expectDenied(() =>
				workerDb.execute(sql`SELECT 1 FROM app.check_rollups_hourly LIMIT 1`),
			);
			await expectDenied(() =>
				workerDb.execute(sql`SELECT 1 FROM app.rollup_state LIMIT 1`),
			);
			await expectDenied(() =>
				workerDb.execute(
					sql`UPDATE app.rollup_state SET rolled_through = now()`,
				),
			);
		});
	});
});
