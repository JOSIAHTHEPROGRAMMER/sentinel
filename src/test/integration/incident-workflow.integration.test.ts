import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkResults, incidents, monitorState } from "@/lib/db/schema/app";
import { workerDb } from "@/lib/db/worker";
import type { HttpCheckResult } from "@/lib/monitoring/http-check";
import type { LifecycleConfig } from "@/lib/monitoring/incident-lifecycle";
import { recordMonitorCheck } from "@/lib/monitoring/record-check";
import {
	asUser,
	cleanupTestUsers,
	closeConnections,
	createTestUser,
	seedMonitor,
} from "./helpers";

const MINUTE = 60_000;

// A 60 second interval gives a gap threshold of exactly 3 minutes
const defaults: LifecycleConfig = {
	failureThreshold: 1,
	recoveryThreshold: 1,
	intervalSeconds: 60,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const pass: HttpCheckResult = {
	success: true,
	statusCode: 200,
	responseTimeMs: 42,
	finalUrl: "https://integration.invalid/",
};

const fail = (error = "HTTP 503"): HttpCheckResult => ({
	success: false,
	statusCode: error.startsWith("HTTP ") ? Number(error.slice(5)) : null,
	responseTimeMs: 85,
	finalUrl: "https://integration.invalid/",
	error,
});

let owner: { id: string };
let stranger: { id: string };

// Enabled, because the worker role may only write for enabled monitors. The
// seeded lease keeps a running worker from claiming it
async function freshMonitor(): Promise<string> {
	return seedMonitor(owner.id, { enabled: true });
}

// A short pause keeps consecutive checks on distinct milliseconds
async function record(
	monitorId: string,
	result: HttpCheckResult,
	config: LifecycleConfig = defaults,
) {
	await recordMonitorCheck({ monitorId, result, config });
	await sleep(5);
}

function checksOf(monitorId: string) {
	return asUser(owner.id, (tx) =>
		tx
			.select()
			.from(checkResults)
			.where(eq(checkResults.monitorId, monitorId))
			.orderBy(asc(checkResults.checkedAt)),
	);
}

function incidentsOf(monitorId: string) {
	return asUser(owner.id, (tx) =>
		tx
			.select()
			.from(incidents)
			.where(eq(incidents.monitorId, monitorId))
			.orderBy(asc(incidents.startedAt)),
	);
}

async function stateOf(monitorId: string) {
	const [row] = await workerDb
		.select()
		.from(monitorState)
		.where(eq(monitorState.monitorId, monitorId));

	return row;
}

describe("incident workflow against the database", () => {
	beforeAll(async () => {
		await cleanupTestUsers();

		[owner, stranger] = await Promise.all([
			createTestUser("owner"),
			createTestUser("stranger"),
		]);
	});

	afterAll(async () => {
		await cleanupTestUsers();
		await closeConnections();
	});

	describe("with default thresholds", () => {
		it("records the check with its status, HTTP code and latency", async () => {
			const id = await freshMonitor();

			await record(id, pass);
			await record(id, fail("HTTP 503"));
			await record(id, fail("Request timed out"));

			const rows = await checksOf(id);

			expect(rows.map((row) => row.status)).toEqual(["up", "down", "timeout"]);
			expect(rows[0]).toMatchObject({ httpStatus: 200, latencyMs: 42 });
			expect(rows[1]).toMatchObject({
				httpStatus: 503,
				errorMessage: "HTTP 503",
			});
			expect(rows[2]).toMatchObject({
				httpStatus: null,
				errorMessage: "Request timed out",
			});
		});

		it("opens an incident on the first failure and does not duplicate it", async () => {
			const id = await freshMonitor();

			await record(id, fail("HTTP 500"));
			await record(id, fail("HTTP 502"));
			await record(id, fail("HTTP 503"));

			const rows = await incidentsOf(id);

			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ reason: "HTTP 500", resolvedAt: null });
		});

		it("resolves the incident on the first success", async () => {
			const id = await freshMonitor();

			await record(id, fail());
			await record(id, pass);

			const [incident] = await incidentsOf(id);
			const checks = await checksOf(id);

			expect(incident?.resolvedAt).not.toBeNull();
			expect(incident?.resolvedAt?.getTime()).toBe(
				checks[1]?.checkedAt.getTime(),
			);
		});

		it("opens a separate incident for a later outage", async () => {
			const id = await freshMonitor();

			await record(id, fail());
			await record(id, pass);
			await record(id, fail("HTTP 502"));

			const rows = await incidentsOf(id);

			expect(rows).toHaveLength(2);
			expect(rows.filter((row) => row.resolvedAt === null)).toHaveLength(1);
			expect(rows[1]?.reason).toBe("HTTP 502");
		});

		it("does nothing to incidents while a monitor stays healthy", async () => {
			const id = await freshMonitor();

			await record(id, pass);
			await record(id, pass);

			expect(await incidentsOf(id)).toHaveLength(0);
			expect((await stateOf(id))?.consecutiveSuccesses).toBe(2);
		});
	});

	describe("failure threshold", () => {
		const config = { ...defaults, failureThreshold: 3 };

		it("opens no incident below the threshold", async () => {
			const id = await freshMonitor();

			await record(id, fail(), config);
			await record(id, fail(), config);

			expect(await incidentsOf(id)).toHaveLength(0);
			expect((await stateOf(id))?.consecutiveFailures).toBe(2);
		});

		it("opens at the threshold, back-dated to the first failure, with its reason", async () => {
			const id = await freshMonitor();

			await record(id, fail("HTTP 502"), config);
			await record(id, fail("HTTP 500"), config);
			await record(id, fail("HTTP 503"), config);

			const [incident] = await incidentsOf(id);
			const checks = await checksOf(id);

			expect(incident?.reason).toBe("HTTP 502");
			expect(incident?.startedAt.getTime()).toBe(
				checks[0]?.checkedAt.getTime(),
			);
			expect(incident?.resolvedAt).toBeNull();
		});

		it("keeps the original start while the outage continues", async () => {
			const id = await freshMonitor();

			for (let index = 0; index < 5; index++) {
				await record(id, fail(), config);
			}

			const rows = await incidentsOf(id);
			const checks = await checksOf(id);

			expect(rows).toHaveLength(1);
			expect(rows[0]?.startedAt.getTime()).toBe(checks[0]?.checkedAt.getTime());
			expect((await stateOf(id))?.consecutiveFailures).toBe(5);
		});

		it("resets the streak after a success, so scattered failures never open one", async () => {
			const id = await freshMonitor();

			await record(id, fail(), config);
			await record(id, fail(), config);
			await record(id, pass, config);
			await record(id, fail(), config);

			expect(await incidentsOf(id)).toHaveLength(0);

			const state = await stateOf(id);

			expect(state?.consecutiveFailures).toBe(1);
			expect(state?.consecutiveSuccesses).toBe(0);
		});
	});

	describe("recovery threshold", () => {
		const config = { ...defaults, recoveryThreshold: 2 };

		it("needs consecutive successes to resolve, back-dated to the first of them", async () => {
			const id = await freshMonitor();

			await record(id, fail(), config);
			await record(id, pass, config);

			expect((await incidentsOf(id))[0]?.resolvedAt).toBeNull();

			await record(id, fail(), config);
			await record(id, pass, config);

			expect((await incidentsOf(id))[0]?.resolvedAt).toBeNull();

			await record(id, pass, config);

			const [incident] = await incidentsOf(id);
			const checks = await checksOf(id);

			// Checks: fail, pass, fail, pass, pass. The recovering streak began at index 3
			expect(await incidentsOf(id)).toHaveLength(1);
			expect(incident?.resolvedAt?.getTime()).toBe(
				checks[3]?.checkedAt.getTime(),
			);
		});

		it("does not open a second incident for a failure inside the recovery window", async () => {
			const id = await freshMonitor();

			await record(id, fail(), config);
			await record(id, pass, config);
			await record(id, fail("HTTP 500"), config);

			const rows = await incidentsOf(id);

			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ reason: "HTTP 503", resolvedAt: null });
		});
	});

	describe("gaps between checks", () => {
		it("restarts a failure streak when the worker was away for too long", async () => {
			const id = await freshMonitor();
			const config = { ...defaults, failureThreshold: 3 };

			await workerDb.insert(monitorState).values({
				monitorId: id,
				consecutiveFailures: 2,
				failureStreakStartedAt: new Date(Date.now() - 70 * MINUTE),
				failureReason: "HTTP 500",
				lastCheckedAt: new Date(Date.now() - 60 * MINUTE),
			});

			await record(id, fail("HTTP 503"), config);

			const state = await stateOf(id);

			expect(await incidentsOf(id)).toHaveLength(0);
			expect(state?.consecutiveFailures).toBe(1);
			expect(state?.failureReason).toBe("HTTP 503");
		});

		it("restarts a success streak after a gap, leaving the incident open", async () => {
			const id = await seedMonitor(owner.id, {
				enabled: true,
				incidents: [{ startedMinutesAgo: 120, reason: "HTTP 500" }],
			});
			const config = { ...defaults, recoveryThreshold: 2 };

			await workerDb.insert(monitorState).values({
				monitorId: id,
				consecutiveSuccesses: 1,
				successStreakStartedAt: new Date(Date.now() - 60 * MINUTE),
				lastCheckedAt: new Date(Date.now() - 60 * MINUTE),
			});

			await record(id, pass, config);

			const [incident] = await incidentsOf(id);

			expect(incident?.resolvedAt).toBeNull();
			expect((await stateOf(id))?.consecutiveSuccesses).toBe(1);
		});

		it("continues a streak when the gap is within the allowed window", async () => {
			const id = await freshMonitor();
			const config = { ...defaults, failureThreshold: 3 };

			await workerDb.insert(monitorState).values({
				monitorId: id,
				consecutiveFailures: 2,
				failureStreakStartedAt: new Date(Date.now() - 2 * MINUTE),
				failureReason: "HTTP 500",
				lastCheckedAt: new Date(Date.now() - 1 * MINUTE),
			});

			await record(id, fail("HTTP 503"), config);

			const [incident] = await incidentsOf(id);

			expect(incident?.reason).toBe("HTTP 500");
			expect((await stateOf(id))?.consecutiveFailures).toBe(3);
		});
	});

	describe("concurrency", () => {
		it("never creates two open incidents when checks overlap", async () => {
			const id = await freshMonitor();

			await record(id, fail());
			await Promise.all(
				Array.from({ length: 5 }, () =>
					recordMonitorCheck({
						monitorId: id,
						result: fail(),
						config: defaults,
					}),
				),
			);

			const open = (await incidentsOf(id)).filter(
				(incident) => incident.resolvedAt === null,
			);

			expect(open).toHaveLength(1);
			expect(await checksOf(id)).toHaveLength(6);
		});

		it("serializes overlapping checks so no streak update is lost", async () => {
			const id = await freshMonitor();

			// The first check creates the state row that the others then lock
			await record(id, fail());
			await Promise.all(
				Array.from({ length: 5 }, () =>
					recordMonitorCheck({
						monitorId: id,
						result: fail(),
						config: defaults,
					}),
				),
			);

			expect((await stateOf(id))?.consecutiveFailures).toBe(6);
		});
	});

	describe("what the worker role may touch", () => {
		it("refuses to record a check for a disabled monitor, writing nothing", async () => {
			const id = await seedMonitor(owner.id, { enabled: false });

			await expect(
				recordMonitorCheck({ monitorId: id, result: pass, config: defaults }),
			).rejects.toThrow();

			expect(await checksOf(id)).toHaveLength(0);
			expect(await stateOf(id)).toBeUndefined();
		});

		it("refuses to record a check for a deleted monitor, writing nothing", async () => {
			const id = await seedMonitor(owner.id, { deleted: true });

			await expect(
				recordMonitorCheck({ monitorId: id, result: pass, config: defaults }),
			).rejects.toThrow();

			expect(await checksOf(id)).toHaveLength(0);
		});

		it("hides a monitor's checks and incidents from other users", async () => {
			const id = await freshMonitor();

			await record(id, fail());

			const seen = await asUser(stranger.id, async (tx) => ({
				checks: await tx
					.select({ id: checkResults.id })
					.from(checkResults)
					.where(eq(checkResults.monitorId, id)),
				incidents: await tx
					.select({ id: incidents.id })
					.from(incidents)
					.where(eq(incidents.monitorId, id)),
			}));

			expect(seen.checks).toHaveLength(0);
			expect(seen.incidents).toHaveLength(0);
		});
	});
});
