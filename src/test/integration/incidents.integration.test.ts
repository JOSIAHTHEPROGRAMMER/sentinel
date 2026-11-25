import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getIncidentDetail } from "@/lib/data/incident-detail";
import { getIncidentsOverview } from "@/lib/data/incidents";
import {
	DEFAULT_INCIDENT_FILTERS,
	type IncidentFilters,
} from "@/lib/data/incidents-shared";
import { incidents } from "@/lib/db/schema/app";
import {
	asUser,
	cleanupTestUsers,
	closeConnections,
	createProject,
	createTestUser,
	seedMonitor,
} from "./helpers";

const DAY = 24 * 60;

let alice: { id: string };
let bob: { id: string };
let longUser: { id: string };
let projectId: string;
let alpha: string;
let bravo: string;
let charlie: string;
let bobMonitor: string;
let longMonitor: string;

function overview(userId: string, changes: Partial<IncidentFilters> = {}) {
	return getIncidentsOverview(userId, {
		...DEFAULT_INCIDENT_FILTERS,
		...changes,
	});
}

async function incidentsOf(userId: string, monitorId: string) {
	return asUser(userId, (tx) =>
		tx
			.select({
				id: incidents.id,
				startedAt: incidents.startedAt,
				resolvedAt: incidents.resolvedAt,
			})
			.from(incidents)
			.where(eq(incidents.monitorId, monitorId))
			.orderBy(asc(incidents.startedAt)),
	);
}

describe("incident queries", () => {
	beforeAll(async () => {
		await cleanupTestUsers();

		[alice, bob, longUser] = await Promise.all([
			createTestUser("alice"),
			createTestUser("bob"),
			createTestUser("long"),
		]);

		projectId = await createProject(alice.id, "Project P");

		[alpha, bravo, charlie, bobMonitor, longMonitor] = await Promise.all([
			seedMonitor(alice.id, {
				name: "Alpha",
				projectId,
				checks: [
					{ minutesAgo: 200, status: "up" },
					{ minutesAgo: 180, status: "down" },
					{ minutesAgo: 160, status: "down" },
					{ minutesAgo: 140, status: "down" },
					{ minutesAgo: 125, status: "down" },
					{ minutesAgo: 120, status: "up" },
					{ minutesAgo: 100, status: "up" },
					{ minutesAgo: 80, status: "up" },
					{ minutesAgo: 60, status: "up" },
					{ minutesAgo: 40, status: "up" },
					{ minutesAgo: 30, status: "up" },
					{ minutesAgo: 15, status: "down" },
					{ minutesAgo: 10, status: "down" },
					{ minutesAgo: 5, status: "down" },
				],
				incidents: [
					{
						startedMinutesAgo: 180,
						resolvedMinutesAgo: 120,
						reason: "HTTP 500",
					},
					{ startedMinutesAgo: 15, reason: "HTTP 503" },
				],
			}),
			seedMonitor(alice.id, {
				name: "Bravo",
				incidents: [
					{
						startedMinutesAgo: 5 * DAY,
						resolvedMinutesAgo: 5 * DAY - 30,
						reason: "Request timed out",
					},
				],
			}),
			seedMonitor(alice.id, {
				name: "Charlie deleted",
				deleted: true,
				incidents: [{ startedMinutesAgo: 60 }],
			}),
			seedMonitor(bob.id, {
				name: "Bob's",
				incidents: [{ startedMinutesAgo: 20 }],
			}),
			seedMonitor(longUser.id, {
				name: "Long outage",
				checks: [
					{ minutesAgo: 125, status: "up" },
					...Array.from({ length: 120 }, (_, index) => ({
						minutesAgo: index + 1,
						status: "down" as const,
					})),
				],
				incidents: [{ startedMinutesAgo: 150, reason: "HTTP 500" }],
			}),
		]);
	});

	afterAll(async () => {
		await cleanupTestUsers();
		await closeConnections();
	});

	describe("getIncidentsOverview", () => {
		it("lists the user's incidents newest first, with project names", async () => {
			const result = await overview(alice.id);

			expect(result.incidents.map((item) => item.reason)).toEqual([
				"HTTP 503",
				"HTTP 500",
				"Request timed out",
			]);
			expect(result.incidents[0]?.projectName).toBe("Project P");
			expect(result.incidents[2]?.projectName).toBeNull();
		});

		it("excludes soft-deleted monitors and other users", async () => {
			const result = await overview(alice.id);
			const monitorIds = result.incidents.map((item) => item.monitorId);

			expect(monitorIds).not.toContain(charlie);
			expect(monitorIds).not.toContain(bobMonitor);
			expect(result.stats.total).toBe(3);
		});

		it("computes statistics for the selected period", async () => {
			const month = await overview(alice.id, { range: "30d" });

			expect(month.stats).toEqual({
				total: 3,
				open: 1,
				resolved: 2,
				// (60 min + 30 min) / 2
				averageResolutionMs: 2_700_000,
				perDay: 0.1,
			});
		});

		it("narrows to incidents that started inside a shorter period", async () => {
			const day = await overview(alice.id, { range: "24h" });
			const week = await overview(alice.id, { range: "7d" });

			expect(day.stats).toMatchObject({
				total: 2,
				open: 1,
				resolved: 1,
				averageResolutionMs: 3_600_000,
				perDay: 2,
			});
			expect(week.stats).toMatchObject({ total: 3, perDay: 0.43 });
		});

		it("reports no frequency when the period is all time", async () => {
			const result = await overview(alice.id, { range: "all" });

			expect(result.stats.total).toBe(3);
			expect(result.stats.perDay).toBeNull();
		});

		it("filters the list by status but keeps the statistics for the whole period", async () => {
			const open = await overview(alice.id, { status: "open" });
			const resolved = await overview(alice.id, { status: "resolved" });

			expect(open.incidents).toHaveLength(1);
			expect(resolved.incidents).toHaveLength(2);
			expect(open.stats.total).toBe(3);
			expect(resolved.stats.open).toBe(1);
		});

		it("filters by project", async () => {
			const result = await overview(alice.id, { projectId });

			expect(result.incidents).toHaveLength(2);
			expect(result.stats.total).toBe(2);
		});

		it("filters by monitor", async () => {
			const result = await overview(alice.id, { monitorId: bravo });

			expect(result.incidents).toHaveLength(1);
			expect(result.stats).toMatchObject({
				total: 1,
				resolved: 1,
				averageResolutionMs: 1_800_000,
			});
		});

		it("returns nothing when filtering by another user's monitor", async () => {
			const result = await overview(alice.id, { monitorId: bobMonitor });

			expect(result.incidents).toEqual([]);
			expect(result.stats).toEqual({
				total: 0,
				open: 0,
				resolved: 0,
				averageResolutionMs: null,
				perDay: 0,
			});
		});

		it("returns no average resolution when nothing is resolved", async () => {
			const result = await overview(alice.id, {
				monitorId: alpha,
				status: "open",
				range: "24h",
			});

			expect(result.stats.averageResolutionMs).toBe(3_600_000);

			const bobs = await overview(bob.id);

			expect(bobs.stats.averageResolutionMs).toBeNull();
		});

		it("offers only the user's live monitors and projects as filter options", async () => {
			const result = await overview(alice.id);

			expect(result.monitorOptions.map((option) => option.name)).toEqual([
				"Alpha",
				"Bravo",
			]);
			expect(result.projectOptions.map((option) => option.name)).toEqual([
				"Project P",
			]);
		});
	});

	describe("getIncidentDetail", () => {
		it("returns null for another user's incident", async () => {
			const [incident] = await incidentsOf(alice.id, alpha);

			expect(await getIncidentDetail(bob.id, incident?.id ?? "")).toBeNull();
		});

		it("returns null for an incident on a soft-deleted monitor", async () => {
			const [incident] = await incidentsOf(alice.id, charlie);

			expect(await getIncidentDetail(alice.id, incident?.id ?? "")).toBeNull();
		});

		it("returns null for an incident that does not exist", async () => {
			expect(await getIncidentDetail(alice.id, randomUUID())).toBeNull();
		});

		it("describes a resolved incident with its monitor, project and thresholds", async () => {
			const [resolved] = await incidentsOf(alice.id, alpha);
			const detail = await getIncidentDetail(alice.id, resolved?.id ?? "");

			expect(detail?.incident.reason).toBe("HTTP 500");
			expect(detail?.incident.resolvedAt).not.toBeNull();
			expect(detail?.monitor).toMatchObject({
				id: alpha,
				name: "Alpha",
				failureThreshold: 1,
				recoveryThreshold: 1,
			});
			expect(detail?.project).toEqual({ id: projectId, name: "Project P" });
		});

		it("lists the checks inside the incident oldest first, up to its resolution", async () => {
			const [resolved] = await incidentsOf(alice.id, alpha);
			const detail = await getIncidentDetail(alice.id, resolved?.id ?? "");

			expect(detail?.during.total).toBe(4);
			expect(detail?.during.failed).toBe(4);
			expect(detail?.during.checks).toHaveLength(4);

			const times = (detail?.during.checks ?? []).map((check) =>
				Date.parse(check.checkedAt),
			);

			expect(times).toEqual([...times].sort((a, b) => a - b));
		});

		it("shows the first checks after the resolution as the recovery, capped at five", async () => {
			const [resolved] = await incidentsOf(alice.id, alpha);
			const detail = await getIncidentDetail(alice.id, resolved?.id ?? "");

			expect(detail?.recovery).toHaveLength(5);
			expect(detail?.recovery.every((check) => check.status === "up")).toBe(
				true,
			);
		});

		it("describes an open incident without a recovery section", async () => {
			const [, open] = await incidentsOf(alice.id, alpha);
			const detail = await getIncidentDetail(alice.id, open?.id ?? "");

			expect(detail?.incident.resolvedAt).toBeNull();
			expect(detail?.during).toMatchObject({ total: 3, failed: 3 });
			expect(detail?.recovery).toEqual([]);
		});

		it("returns an empty timeline and no project for a standalone monitor without checks", async () => {
			const [incident] = await incidentsOf(alice.id, bravo);
			const detail = await getIncidentDetail(alice.id, incident?.id ?? "");

			expect(detail?.project).toBeNull();
			expect(detail?.during).toEqual({ checks: [], total: 0, failed: 0 });
			expect(detail?.recovery).toEqual([]);
		});

		it("caps a long timeline but reports the true totals", async () => {
			const [incident] = await incidentsOf(longUser.id, longMonitor);
			const detail = await getIncidentDetail(longUser.id, incident?.id ?? "");

			expect(detail?.during.checks).toHaveLength(100);
			// 120 failures plus one success inside the outage
			expect(detail?.during.total).toBe(121);
			expect(detail?.during.failed).toBe(120);

			// The oldest check comes first, and it is the success from before the failures
			expect(detail?.during.checks[0]?.status).toBe("up");
		});
	});
});
