import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getProjectForUser, getProjectsForUser } from "@/lib/data/projects";
import {
	cleanupTestUsers,
	closeConnections,
	createProject,
	createTestUser,
	seedMonitor,
} from "./helpers";

let alice: { id: string };
let bob: { id: string };
let projectOne: string;
let projectTwo: string;
let bobProject: string;
let checkedMonitor: string;
let pausedMonitor: string;

describe("project queries", () => {
	beforeAll(async () => {
		await cleanupTestUsers();

		[alice, bob] = await Promise.all([
			createTestUser("alice"),
			createTestUser("bob"),
		]);

		// Created one after the other so the list order is deterministic
		projectOne = await createProject(alice.id, "Project One");
		projectTwo = await createProject(alice.id, "Project Two");
		bobProject = await createProject(bob.id, "Bob project");

		[checkedMonitor, pausedMonitor] = await Promise.all([
			seedMonitor(alice.id, {
				name: "Checked",
				enabled: true,
				projectId: projectOne,
				checks: [
					{ minutesAgo: 5, status: "up", latencyMs: 100 },
					{ minutesAgo: 10, status: "up", latencyMs: 300 },
					{ minutesAgo: 15, status: "down", latencyMs: 5000, httpStatus: 503 },
				],
				incidents: [{ startedMinutesAgo: 15, reason: "HTTP 503" }],
			}),
			seedMonitor(alice.id, {
				name: "Paused",
				projectId: projectOne,
				checks: [
					{ minutesAgo: 20, status: "up", latencyMs: 200 },
					// Older than 24 hours, so it must not count toward health
					{ minutesAgo: 30 * 60, status: "up", latencyMs: 9999 },
				],
			}),
			// A soft-deleted monitor must disappear from every count
			seedMonitor(alice.id, {
				name: "Removed",
				deleted: true,
				projectId: projectOne,
				checks: [
					{ minutesAgo: 5, status: "down" },
					{ minutesAgo: 6, status: "down" },
				],
				incidents: [{ startedMinutesAgo: 30 }],
			}),
			seedMonitor(bob.id, {
				name: "Bob's",
				enabled: true,
				projectId: bobProject,
				checks: [{ minutesAgo: 5, status: "down" }],
				incidents: [{ startedMinutesAgo: 5 }],
			}),
		]);
	});

	afterAll(async () => {
		await cleanupTestUsers();
		await closeConnections();
	});

	describe("getProjectsForUser", () => {
		it("lists only the user's own projects, oldest first", async () => {
			const projects = await getProjectsForUser(alice.id);

			expect(projects.map((project) => project.name)).toEqual([
				"Project One",
				"Project Two",
			]);
		});

		it("counts monitors, with enabled and disabled split, ignoring deleted ones", async () => {
			const [one] = await getProjectsForUser(alice.id);

			expect(one).toMatchObject({
				monitorCount: 2,
				enabledCount: 1,
				disabledCount: 1,
			});
		});

		it("counts open incidents per project, ignoring deleted monitors", async () => {
			const [one, two] = await getProjectsForUser(alice.id);

			expect(one?.openIncidents).toBe(1);
			expect(two?.openIncidents).toBe(0);
		});

		it("computes 24 hour health from successful checks only", async () => {
			const [one] = await getProjectsForUser(alice.id);

			expect(one?.health).toEqual({
				totalChecks: 4,
				successfulChecks: 3,
				uptimePercentage: 75,
				// (100 + 300 + 200) / 3, without the failed 5000 ms or the old 9999 ms
				averageResponseTime: 200,
			});
		});

		it("reports nulls, not zeros, for a project without checks", async () => {
			const projects = await getProjectsForUser(alice.id);
			const two = projects.find((project) => project.id === projectTwo);

			expect(two).toMatchObject({
				monitorCount: 0,
				enabledCount: 0,
				disabledCount: 0,
				health: {
					totalChecks: 0,
					successfulChecks: 0,
					uptimePercentage: null,
					averageResponseTime: null,
				},
			});
		});

		it("never includes another user's projects", async () => {
			const bobs = await getProjectsForUser(bob.id);

			expect(bobs.map((project) => project.name)).toEqual(["Bob project"]);
			expect(bobs[0]?.openIncidents).toBe(1);
		});
	});

	describe("getProjectForUser", () => {
		it("returns null for another user's project", async () => {
			expect(await getProjectForUser(alice.id, bobProject)).toBeNull();
			expect(await getProjectForUser(bob.id, projectOne)).toBeNull();
		});

		it("returns null for a project that does not exist", async () => {
			expect(await getProjectForUser(alice.id, randomUUID())).toBeNull();
		});

		it("lists the project's live monitors and flags the one with an open incident", async () => {
			const result = await getProjectForUser(alice.id, projectOne);

			expect(result?.monitors.map((monitor) => monitor.name)).toEqual([
				"Checked",
				"Paused",
			]);
			expect(result?.monitors[0]?.openIncident).toMatchObject({
				reason: "HTTP 503",
			});
			expect(result?.monitors[1]?.openIncident).toBeNull();
		});

		it("lists monitors with an open incident first", async () => {
			const result = await getProjectForUser(alice.id, projectOne);

			expect(result?.monitors[0]?.id).toBe(checkedMonitor);
			expect(result?.monitors[1]?.id).toBe(pausedMonitor);
		});

		it("reports counts that match the list", async () => {
			const result = await getProjectForUser(alice.id, projectOne);

			expect(result?.counts).toEqual({
				monitors: 2,
				enabled: 1,
				disabled: 1,
				openIncidents: 1,
			});
		});

		it("reports the same health numbers as the project list", async () => {
			const result = await getProjectForUser(alice.id, projectOne);
			const [listed] = await getProjectsForUser(alice.id);

			expect(result?.health).toEqual(listed?.health);
		});

		it("returns an empty project with null health", async () => {
			const result = await getProjectForUser(alice.id, projectTwo);

			expect(result?.monitors).toEqual([]);
			expect(result?.counts).toEqual({
				monitors: 0,
				enabled: 0,
				disabled: 0,
				openIncidents: 0,
			});
			expect(result?.health.uptimePercentage).toBeNull();
		});
	});
});
