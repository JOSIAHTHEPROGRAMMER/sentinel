import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	bucketSecondsForSpan,
	buildBucketStartsForWindow,
	windowForRange,
} from "@/lib/data/analytics-shared";
import { getMonitorChecksData } from "@/lib/data/monitor-checks";
import { monitors } from "@/lib/db/schema/app";
import {
	asUser,
	cleanupTestUsers,
	closeConnections,
	createTestUser,
	seedMonitor,
} from "./helpers";

const DAY = 24 * 60;
const DAY_MS = 86_400_000;

let owner: { id: string };
let stranger: { id: string };
let main: string;
let history: string;
let upMonitor: string;
let downMonitor: string;
let noDataMonitor: string;
let staleMonitor: string;
let disabledMonitor: string;
let deletedMonitor: string;

function load(
	userId: string,
	monitorId: string,
	window?: {
		startMs: number;
		endMs: number;
	},
) {
	const now = Date.now();

	return getMonitorChecksData(
		userId,
		monitorId,
		window ?? windowForRange("24h", now),
		now,
	);
}

function minutesAgoOf(iso: string | null): number {
	return (Date.now() - Date.parse(iso ?? "")) / 60_000;
}

describe("getMonitorChecksData", () => {
	beforeAll(async () => {
		await cleanupTestUsers();

		[owner, stranger] = await Promise.all([
			createTestUser("owner"),
			createTestUser("stranger"),
		]);

		[
			main,
			history,
			upMonitor,
			downMonitor,
			noDataMonitor,
			staleMonitor,
			disabledMonitor,
			deletedMonitor,
		] = await Promise.all([
			seedMonitor(owner.id, {
				name: "Main",
				checks: [
					{ minutesAgo: 5, status: "up", latencyMs: 100 },
					{ minutesAgo: 20, status: "up", latencyMs: 300 },
					{ minutesAgo: 35, status: "down", latencyMs: 9000, httpStatus: 503 },
					{ minutesAgo: 2 * DAY, status: "up", latencyMs: 50 },
					{ minutesAgo: 4 * DAY, status: "up", latencyMs: 70 },
				],
			}),
			seedMonitor(owner.id, {
				name: "History",
				checks: Array.from({ length: 60 }, (_, index) => ({
					minutesAgo: index + 1,
					status: "up" as const,
					latencyMs: 100,
				})),
			}),
			seedMonitor(owner.id, {
				name: "Up",
				enabled: true,
				checks: [{ minutesAgo: 5, status: "up", latencyMs: 100 }],
			}),
			seedMonitor(owner.id, {
				name: "Down",
				enabled: true,
				checks: [
					{ minutesAgo: 30, status: "up", latencyMs: 100 },
					{ minutesAgo: 5, status: "down", latencyMs: 200, httpStatus: 503 },
				],
				incidents: [
					{
						startedMinutesAgo: 3 * DAY,
						resolvedMinutesAgo: 3 * DAY - 60,
						reason: "HTTP 500",
					},
					{ startedMinutesAgo: 5, reason: "HTTP 503" },
				],
			}),
			seedMonitor(owner.id, { name: "No data", enabled: true }),
			(async () => {
				const id = await seedMonitor(owner.id, {
					name: "Stale",
					enabled: true,
					intervalSeconds: 60,
					checks: [{ minutesAgo: 60, status: "up", latencyMs: 100 }],
				});

				// A new monitor gets a grace period, so age it past that
				await asUser(owner.id, (tx) =>
					tx
						.update(monitors)
						.set({ updatedAt: new Date(Date.now() - 2 * DAY_MS) })
						.where(eq(monitors.id, id)),
				);

				return id;
			})(),
			seedMonitor(owner.id, {
				name: "Disabled",
				checks: [{ minutesAgo: 5, status: "up", latencyMs: 100 }],
			}),
			seedMonitor(owner.id, {
				name: "Deleted",
				deleted: true,
				checks: [{ minutesAgo: 5, status: "up", latencyMs: 100 }],
			}),
		]);
	});

	afterAll(async () => {
		await cleanupTestUsers();
		await closeConnections();
	});

	describe("ownership", () => {
		it("returns null for a monitor that belongs to someone else", async () => {
			expect(await load(stranger.id, main)).toBeNull();
		});

		it("returns null for a soft-deleted monitor", async () => {
			expect(await load(owner.id, deletedMonitor)).toBeNull();
		});

		it("returns null for a monitor that does not exist", async () => {
			expect(await load(owner.id, randomUUID())).toBeNull();
		});

		it("returns data for the owner", async () => {
			expect(await load(owner.id, main)).not.toBeNull();
		});
	});

	describe("summary", () => {
		it("counts only the checks inside the window", async () => {
			const result = await load(owner.id, main);

			expect(result?.summary).toEqual({
				totalChecks: 3,
				successfulChecks: 2,
				failedChecks: 1,
				uptimePercentage: 66.66,
				// The failed check's 9000 ms is excluded: (100+300)/2
				averageResponseTimeMs: 200,
			});
		});

		it("respects a custom window in the past", async () => {
			const now = Date.now();
			const result = await load(owner.id, main, {
				startMs: now - 3 * DAY_MS,
				endMs: now - 1 * DAY_MS,
			});

			// Only the check from two days ago falls inside it
			expect(result?.summary).toEqual({
				totalChecks: 1,
				successfulChecks: 1,
				failedChecks: 0,
				uptimePercentage: 100,
				averageResponseTimeMs: 50,
			});
		});

		it("returns nulls rather than zeros for a window without checks", async () => {
			const now = Date.now();
			const result = await load(owner.id, main, {
				startMs: now - 12 * 3_600_000,
				endMs: now - 6 * 3_600_000,
			});

			expect(result?.summary).toEqual({
				totalChecks: 0,
				successfulChecks: 0,
				failedChecks: 0,
				uptimePercentage: null,
				averageResponseTimeMs: null,
			});
		});
	});

	describe("chart buckets", () => {
		it("returns one bucket per interval of the window", async () => {
			const now = Date.now();
			const window = windowForRange("24h", now);
			const result = await load(owner.id, main, window);

			expect(result?.buckets).toHaveLength(
				buildBucketStartsForWindow(window, bucketSecondsForSpan(DAY_MS)).length,
			);
			expect(result?.buckets).toHaveLength(25);
		});

		it("accounts for every check in the window exactly once", async () => {
			const result = await load(owner.id, main);

			const total = result?.buckets.reduce((sum, b) => sum + b.total, 0);
			const successful = result?.buckets.reduce(
				(sum, b) => sum + b.successful,
				0,
			);

			expect(total).toBe(3);
			expect(successful).toBe(2);
		});

		it("follows a custom window's size and contents", async () => {
			const now = Date.now();
			const window = { startMs: now - 3 * DAY_MS, endMs: now - 1 * DAY_MS };
			const result = await load(owner.id, main, window);

			expect(result?.buckets).toHaveLength(
				buildBucketStartsForWindow(window, bucketSecondsForSpan(2 * DAY_MS))
					.length,
			);
			expect(result?.buckets.reduce((sum, b) => sum + b.total, 0)).toBe(1);
		});

		it("returns only empty buckets for a window without checks", async () => {
			const now = Date.now();
			const result = await load(owner.id, main, {
				startMs: now - 12 * 3_600_000,
				endMs: now - 6 * 3_600_000,
			});

			expect(result?.buckets.every((bucket) => bucket.total === 0)).toBe(true);
		});
	});

	describe("history", () => {
		it("returns at most 50 checks, newest first", async () => {
			const result = await load(owner.id, history);

			expect(result?.checks).toHaveLength(50);

			const times = (result?.checks ?? []).map((check) =>
				check.checkedAt.getTime(),
			);

			expect(times).toEqual([...times].sort((a, b) => b - a));
			expect(
				minutesAgoOf(result?.checks[0]?.checkedAt.toISOString() ?? ""),
			).toBeLessThan(3);
		});

		it("does not depend on the selected window", async () => {
			const now = Date.now();
			const result = await load(owner.id, history, {
				startMs: now - 3 * 3_600_000,
				endMs: now - 2 * 3_600_000,
			});

			expect(result?.summary.totalChecks).toBe(0);
			expect(result?.checks).toHaveLength(50);
		});

		it("includes every check kind with its details", async () => {
			const result = await load(owner.id, main);
			const failed = result?.checks.find((check) => check.status === "down");

			expect(failed).toMatchObject({
				httpStatus: 503,
				latencyMs: 9000,
				errorMessage: "Seeded down",
			});
		});
	});

	describe("overview", () => {
		it("reports a healthy monitor as up", async () => {
			const result = await load(owner.id, upMonitor);

			expect(result?.overview.status).toBe("up");
			expect(
				minutesAgoOf(result?.overview.latestCheckedAt ?? null),
			).toBeLessThan(8);
		});

		it("reports a failing latest check as down", async () => {
			const result = await load(owner.id, downMonitor);

			expect(result?.overview.status).toBe("down");
		});

		it("reports a disabled monitor as disabled", async () => {
			const result = await load(owner.id, disabledMonitor);

			expect(result?.overview.status).toBe("disabled");
		});

		it("gives a brand-new monitor a grace period instead of marking it stale", async () => {
			const result = await load(owner.id, noDataMonitor);

			expect(result?.overview.status).toBe("no-data");
			expect(result?.overview.latestCheckedAt).toBeNull();
			expect(result?.overview.lastSuccessAt).toBeNull();
		});

		it("reports a monitor that stopped checking as stale, not up", async () => {
			const result = await load(owner.id, staleMonitor);

			expect(result?.overview.status).toBe("stale");
		});

		it("reports the last successful check separately from the latest check", async () => {
			const result = await load(owner.id, downMonitor);

			expect(
				minutesAgoOf(result?.overview.latestCheckedAt ?? null),
			).toBeLessThan(8);
			expect(
				minutesAgoOf(result?.overview.lastSuccessAt ?? null),
			).toBeGreaterThan(28);
			expect(minutesAgoOf(result?.overview.lastSuccessAt ?? null)).toBeLessThan(
				34,
			);
		});

		it("reports the most recent incident as the last outage", async () => {
			const result = await load(owner.id, downMonitor);

			expect(result?.overview.lastIncident).toMatchObject({
				reason: "HTTP 503",
				resolvedAt: null,
			});
			expect(result?.overview.lastIncident?.id).toEqual(expect.any(String));
		});

		it("reports no outage for a monitor without incidents", async () => {
			const result = await load(owner.id, upMonitor);

			expect(result?.overview.lastIncident).toBeNull();
		});
	});
});
