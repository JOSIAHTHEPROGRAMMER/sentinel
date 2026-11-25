import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { checkResults, incidents, monitors } from "@/lib/db/schema/app";
import { user } from "@/lib/db/schema/auth";
import {
	asUser,
	cleanupTestUsers,
	closeConnections,
	createProject,
	createTestUser,
	seedMonitor,
} from "./helpers";

describe("integration harness", () => {
	beforeAll(async () => {
		// Sweeps anything an earlier crashed run left behind
		await cleanupTestUsers();
	});

	afterAll(async () => {
		await cleanupTestUsers();
		await closeConnections();
	});

	it("seeds monitors, checks and incidents that the owner can read", async () => {
		const owner = await createTestUser("owner");
		const monitorId = await seedMonitor(owner.id, {
			checks: [
				{ minutesAgo: 5, status: "up" },
				{ minutesAgo: 10, status: "down" },
			],
			incidents: [{ startedMinutesAgo: 10, resolvedMinutesAgo: 5 }],
		});

		const checkRows = await asUser(owner.id, (tx) =>
			tx
				.select({ id: checkResults.id })
				.from(checkResults)
				.where(eq(checkResults.monitorId, monitorId)),
		);
		const incidentRows = await asUser(owner.id, (tx) =>
			tx
				.select({ id: incidents.id })
				.from(incidents)
				.where(eq(incidents.monitorId, monitorId)),
		);

		expect(checkRows).toHaveLength(2);
		expect(incidentRows).toHaveLength(1);
	});

	it("hides one user's monitors, checks and incidents from another user", async () => {
		const owner = await createTestUser("owner");
		const stranger = await createTestUser("stranger");
		await seedMonitor(owner.id, {
			checks: [{ minutesAgo: 5, status: "up" }],
			incidents: [{ startedMinutesAgo: 10 }],
		});

		const seen = await asUser(stranger.id, async (tx) => ({
			monitors: await tx.select({ id: monitors.id }).from(monitors),
			checks: await tx.select({ id: checkResults.id }).from(checkResults),
			incidents: await tx.select({ id: incidents.id }).from(incidents),
		}));

		expect(seen.monitors).toHaveLength(0);
		expect(seen.checks).toHaveLength(0);
		expect(seen.incidents).toHaveLength(0);
	});

	it("leaves seeded monitors disabled so a running worker ignores them", async () => {
		const owner = await createTestUser("owner");
		const monitorId = await seedMonitor(owner.id);

		const [row] = await asUser(owner.id, (tx) =>
			tx
				.select({ enabled: monitors.enabled })
				.from(monitors)
				.where(eq(monitors.id, monitorId)),
		);

		expect(row?.enabled).toBe(false);
	});

	it("can soft-delete a seeded monitor", async () => {
		const owner = await createTestUser("owner");
		const monitorId = await seedMonitor(owner.id, { deleted: true });

		const [row] = await asUser(owner.id, (tx) =>
			tx
				.select({ deletedAt: monitors.deletedAt })
				.from(monitors)
				.where(eq(monitors.id, monitorId)),
		);

		expect(row?.deletedAt).not.toBeNull();
	});

	it("creates projects for the owner", async () => {
		const owner = await createTestUser("owner");
		const projectId = await createProject(owner.id, "Alpha");
		const monitorId = await seedMonitor(owner.id, { projectId });

		const [row] = await asUser(owner.id, (tx) =>
			tx
				.select({ projectId: monitors.projectId })
				.from(monitors)
				.where(eq(monitors.id, monitorId)),
		);

		expect(row?.projectId).toBe(projectId);
	});

	it("removes test users and their data on cleanup", async () => {
		const owner = await createTestUser("owner");
		await seedMonitor(owner.id, {
			checks: [{ minutesAgo: 5, status: "up" }],
		});

		await cleanupTestUsers();

		const rows = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.id, owner.id));

		expect(rows).toHaveLength(0);
	});
});
