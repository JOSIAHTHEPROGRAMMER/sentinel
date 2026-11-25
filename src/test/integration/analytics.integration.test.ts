import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	getAnalyticsSummary,
	getDashboardTrend,
	getLastCheckTimes,
} from "@/lib/data/analytics";
import {
	cleanupTestUsers,
	closeConnections,
	createTestUser,
	seedMonitor,
} from "./helpers";

const DAY = 24 * 60;

let alice: { id: string };
let bob: { id: string };
let nobody: { id: string };
let slowUser: { id: string };
let aliceMain: string;
let aliceDeleted: string;
let aliceUnchecked: string;
let bobMonitor: string;

function minutesAgoOf(iso: string): number {
	return (Date.now() - Date.parse(iso)) / 60_000;
}

describe("analytics queries", () => {
	beforeAll(async () => {
		await cleanupTestUsers();

		[alice, bob, nobody, slowUser] = await Promise.all([
			createTestUser("alice"),
			createTestUser("bob"),
			createTestUser("nobody"),
			createTestUser("slow"),
		]);

		[aliceMain, aliceDeleted, aliceUnchecked, bobMonitor] = await Promise.all([
			// Disabled on purpose: disabled monitors still count toward history
			seedMonitor(alice.id, {
				name: "Alice main",
				checks: [
					{ minutesAgo: 5, status: "up", latencyMs: 100 },
					{ minutesAgo: 30, status: "up", latencyMs: 200 },
					{ minutesAgo: 60, status: "up", latencyMs: 300 },
					{ minutesAgo: 90, status: "down", latencyMs: 5000, httpStatus: 503 },
					{ minutesAgo: 120, status: "timeout", latencyMs: null },
					{ minutesAgo: 26 * 60, status: "up", latencyMs: 1000 },
				],
				incidents: [
					{ startedMinutesAgo: 30 * 60 },
					{ startedMinutesAgo: 120, resolvedMinutesAgo: 60 },
					{ startedMinutesAgo: 3 * DAY, resolvedMinutesAgo: 2 * DAY },
				],
			}),
			seedMonitor(alice.id, {
				name: "Alice deleted",
				deleted: true,
				checks: [
					{ minutesAgo: 10, status: "down" },
					{ minutesAgo: 20, status: "down" },
					{ minutesAgo: 30, status: "down" },
				],
				incidents: [{ startedMinutesAgo: 60 }],
			}),
			seedMonitor(alice.id, { name: "Alice unchecked" }),
			seedMonitor(bob.id, {
				name: "Bob",
				checks: [
					{ minutesAgo: 10, status: "down", latencyMs: 400 },
					{ minutesAgo: 20, status: "down", latencyMs: 400 },
				],
				incidents: [{ startedMinutesAgo: 15 }],
			}),
			// Six quick hourly intervals and one slow one, all in separate buckets
			seedMonitor(slowUser.id, {
				name: "Slow",
				checks: [1, 2, 3, 4, 5, 6, 7].map((step) => ({
					minutesAgo: 90 * step,
					status: "up" as const,
					latencyMs: step === 4 ? 3000 : 100,
				})),
			}),
		]);
	});

	afterAll(async () => {
		await cleanupTestUsers();
		await closeConnections();
	});

	describe("getAnalyticsSummary", () => {
		it("counts checks, failures, uptime and response time for the last 24 hours", async () => {
			const summary = await getAnalyticsSummary(alice.id, "24h");

			expect(summary).toMatchObject({
				range: "24h",
				totalChecks: 5,
				successfulChecks: 3,
				failedChecks: 2,
				uptimePercentage: 60,
				// Failed checks and the check without latency are excluded: (100+200+300)/3
				averageResponseTimeMs: 200,
			});
		});

		it("includes older checks when the range grows", async () => {
			const week = await getAnalyticsSummary(alice.id, "7d");
			const month = await getAnalyticsSummary(alice.id, "30d");

			for (const summary of [week, month]) {
				expect(summary).toMatchObject({
					totalChecks: 6,
					successfulChecks: 4,
					failedChecks: 2,
					// 4 of 6 is 66.666...%, floored rather than rounded up
					uptimePercentage: 66.66,
					averageResponseTimeMs: 400,
				});
			}
		});

		it("ignores checks of soft-deleted monitors", async () => {
			const summary = await getAnalyticsSummary(alice.id, "24h");

			// The deleted monitor has three more failed checks inside the window
			expect(summary.totalChecks).toBe(5);
			expect(summary.failedChecks).toBe(2);
		});

		it("never includes another user's checks", async () => {
			const summary = await getAnalyticsSummary(bob.id, "24h");

			expect(summary).toMatchObject({
				totalChecks: 2,
				successfulChecks: 0,
				failedChecks: 2,
				uptimePercentage: 0,
				averageResponseTimeMs: null,
			});
		});

		it("returns nulls rather than zeros for a user with no checks", async () => {
			const summary = await getAnalyticsSummary(nobody.id, "24h");

			expect(summary).toEqual({
				range: "24h",
				totalChecks: 0,
				successfulChecks: 0,
				failedChecks: 0,
				uptimePercentage: null,
				averageResponseTimeMs: null,
				openIncidents: 0,
				incidentsStarted: 0,
				incidentsResolved: 0,
			});
		});

		it("keeps open, started and resolved incidents as separate numbers", async () => {
			const day = await getAnalyticsSummary(alice.id, "24h");

			// The open incident began 30 hours ago, so it is open but did not start today
			expect(day).toMatchObject({
				openIncidents: 1,
				incidentsStarted: 1,
				incidentsResolved: 1,
			});

			const week = await getAnalyticsSummary(alice.id, "7d");

			expect(week).toMatchObject({
				openIncidents: 1,
				incidentsStarted: 3,
				incidentsResolved: 2,
			});
		});

		it("ignores incidents of soft-deleted monitors", async () => {
			const summary = await getAnalyticsSummary(alice.id, "30d");

			// The deleted monitor has an open incident that must not be counted
			expect(summary.openIncidents).toBe(1);
		});

		it("never includes another user's incidents", async () => {
			const summary = await getAnalyticsSummary(bob.id, "24h");

			expect(summary.openIncidents).toBe(1);
			expect(summary.incidentsStarted).toBe(1);
			expect(summary.incidentsResolved).toBe(0);
		});
	});

	describe("getDashboardTrend", () => {
		it("returns a bucket for every interval in each range", async () => {
			expect(await getDashboardTrend(alice.id, "24h")).toHaveLength(25);
			expect(await getDashboardTrend(alice.id, "7d")).toHaveLength(29);
			expect(await getDashboardTrend(alice.id, "30d")).toHaveLength(31);
		});

		it("accounts for every check in the window exactly once", async () => {
			const day = await getDashboardTrend(alice.id, "24h");
			const month = await getDashboardTrend(alice.id, "30d");

			const sum = (buckets: typeof day, key: "total" | "successful") =>
				buckets.reduce((total, bucket) => total + bucket[key], 0);

			expect(sum(day, "total")).toBe(5);
			expect(sum(day, "successful")).toBe(3);
			expect(sum(month, "total")).toBe(6);
			expect(sum(month, "successful")).toBe(4);
		});

		it("excludes soft-deleted monitors and other users", async () => {
			const alicesTrend = await getDashboardTrend(alice.id, "24h");
			const bobsTrend = await getDashboardTrend(bob.id, "24h");

			const total = (buckets: typeof alicesTrend) =>
				buckets.reduce((sum, bucket) => sum + bucket.total, 0);

			expect(total(alicesTrend)).toBe(5);
			expect(total(bobsTrend)).toBe(2);
		});

		it("returns empty buckets, none flagged slow, for a user with no checks", async () => {
			const trend = await getDashboardTrend(nobody.id, "24h");

			expect(trend).toHaveLength(25);
			expect(trend.every((bucket) => bucket.total === 0)).toBe(true);
			expect(trend.every((bucket) => bucket.averageLatencyMs === null)).toBe(
				true,
			);
			expect(trend.some((bucket) => bucket.slow)).toBe(false);
		});

		it("flags an interval that is far slower than the rest", async () => {
			const trend = await getDashboardTrend(slowUser.id, "24h");

			const withData = trend.filter((bucket) => bucket.total > 0);
			const slow = trend.filter((bucket) => bucket.slow);

			expect(withData).toHaveLength(7);
			expect(slow).toHaveLength(1);
			expect(slow[0]?.averageLatencyMs).toBe(3000);
		});

		it("does not flag anything when latency is steady", async () => {
			const trend = await getDashboardTrend(alice.id, "24h");

			expect(trend.some((bucket) => bucket.slow)).toBe(false);
		});
	});

	describe("getLastCheckTimes", () => {
		it("returns the newest check time for each monitor with checks", async () => {
			const times = await getLastCheckTimes(alice.id);
			const iso = times[aliceMain];

			expect(iso).toBeDefined();
			expect(minutesAgoOf(iso ?? "")).toBeGreaterThan(4);
			expect(minutesAgoOf(iso ?? "")).toBeLessThan(8);
		});

		it("omits monitors that have never been checked", async () => {
			const times = await getLastCheckTimes(alice.id);

			expect(times[aliceUnchecked]).toBeUndefined();
		});

		it("omits soft-deleted monitors", async () => {
			const times = await getLastCheckTimes(alice.id);

			expect(times[aliceDeleted]).toBeUndefined();
			expect(Object.keys(times)).toEqual([aliceMain]);
		});

		it("never includes another user's monitors", async () => {
			const alices = await getLastCheckTimes(alice.id);
			const bobs = await getLastCheckTimes(bob.id);

			expect(alices[bobMonitor]).toBeUndefined();
			expect(Object.keys(bobs)).toEqual([bobMonitor]);
		});

		it("returns an empty map for a user without checks", async () => {
			expect(await getLastCheckTimes(nobody.id)).toEqual({});
		});
	});
});
