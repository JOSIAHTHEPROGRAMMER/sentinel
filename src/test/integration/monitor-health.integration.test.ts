import { afterAll, describe, expect, it } from "vitest";
import { getMonitorHealth } from "@/lib/data/monitor-health";
import {
	cleanupTestUsers,
	closeConnections,
	createTestUser,
	seedMonitor,
} from "./helpers";

afterAll(async () => {
	await cleanupTestUsers();
	await closeConnections();
});

describe("getMonitorHealth", () => {
	it("returns the latest check and the 24 hour counts", async () => {
		const { id: userId } = await createTestUser("health");
		const monitorId = await seedMonitor(userId, {
			checks: [
				{ minutesAgo: 10, status: "up" },
				{ minutesAgo: 70, status: "down" },
				{ minutesAgo: 90, status: "up" },
				// Outside the 24 hour window
				{ minutesAgo: 30 * 60, status: "up" },
			],
		});

		const health = (await getMonitorHealth(userId, Date.now()))[monitorId];

		expect(health?.latestStatus).toBe("up");
		expect(
			Math.abs(
				Date.parse(health?.latestCheckedAt ?? "") - (Date.now() - 10 * 60_000),
			),
		).toBeLessThan(10_000);
		expect(health?.totalChecks).toBe(3);
		expect(health?.successfulChecks).toBe(2);
	});

	it("reports the newest check even when it failed", async () => {
		const { id: userId } = await createTestUser("health");
		const monitorId = await seedMonitor(userId, {
			checks: [
				{ minutesAgo: 5, status: "timeout" },
				{ minutesAgo: 65, status: "up" },
			],
		});

		const health = (await getMonitorHealth(userId, Date.now()))[monitorId];

		expect(health?.latestStatus).toBe("timeout");
	});

	it("still lists a monitor that has no checks", async () => {
		const { id: userId } = await createTestUser("health");
		const monitorId = await seedMonitor(userId);

		const health = (await getMonitorHealth(userId, Date.now()))[monitorId];

		expect(health).toEqual({
			latestCheckedAt: null,
			latestStatus: null,
			totalChecks: 0,
			successfulChecks: 0,
		});
	});

	it("excludes soft-deleted monitors and other users' monitors", async () => {
		const { id: userId } = await createTestUser("health");
		const { id: otherId } = await createTestUser("health-other");
		const deletedId = await seedMonitor(userId, {
			deleted: true,
			checks: [{ minutesAgo: 5, status: "up" }],
		});
		const otherMonitorId = await seedMonitor(otherId, {
			checks: [{ minutesAgo: 5, status: "up" }],
		});

		const health = await getMonitorHealth(userId, Date.now());

		expect(health[deletedId]).toBeUndefined();
		expect(health[otherMonitorId]).toBeUndefined();
	});
});
