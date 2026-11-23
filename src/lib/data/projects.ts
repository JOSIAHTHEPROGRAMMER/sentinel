import "server-only";

import { and, asc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
	checkResults,
	incidents,
	monitors,
	projects,
} from "@/lib/db/schema/app";
import { calculateUptimePercentage, rangeToMs } from "./analytics-shared";

const HEALTH_WINDOW_MS = rangeToMs("24h");

export async function getProjectsForUser(userId: string) {
	const since = new Date(Date.now() - HEALTH_WINDOW_MS);

	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const results = await tx
			.select({
				id: projects.id,
				name: projects.name,
				createdAt: projects.createdAt,
				updatedAt: projects.updatedAt,
				monitorCount: sql<number>`count(distinct ${monitors.id})::int`,
				enabledCount: sql<number>`(count(distinct ${monitors.id}) filter (where ${monitors.enabled}))::int`,
				totalChecks: sql<number>`count(${checkResults.id})::int`,
				successfulChecks: sql<number>`(count(${checkResults.id}) filter (where ${checkResults.status} = 'up'))::int`,
				averageResponseTime: sql<
					number | null
				>`(round(avg(${checkResults.latencyMs}) filter (where ${checkResults.status} = 'up')))::int`,
			})
			.from(projects)
			.leftJoin(
				monitors,
				and(eq(monitors.projectId, projects.id), isNull(monitors.deletedAt)),
			)
			.leftJoin(
				checkResults,
				and(
					eq(checkResults.monitorId, monitors.id),
					gte(checkResults.checkedAt, since),
				),
			)
			.groupBy(projects.id)
			.orderBy(asc(projects.createdAt));

		// A separate query: joining incidents above would multiply the check rows
		const openIncidentRows = await tx
			.select({
				projectId: monitors.projectId,
				open: sql<number>`count(*)::int`,
			})
			.from(incidents)
			.innerJoin(monitors, eq(incidents.monitorId, monitors.id))
			.where(
				and(
					isNull(incidents.resolvedAt),
					isNull(monitors.deletedAt),
					isNotNull(monitors.projectId),
				),
			)
			.groupBy(monitors.projectId);

		const openByProject = new Map(
			openIncidentRows.map((row) => [row.projectId, row.open]),
		);

		return results.map((project) => ({
			id: project.id,
			name: project.name,
			createdAt: project.createdAt.toISOString(),
			updatedAt: project.updatedAt.toISOString(),
			monitorCount: project.monitorCount,
			enabledCount: project.enabledCount,
			disabledCount: project.monitorCount - project.enabledCount,
			openIncidents: openByProject.get(project.id) ?? 0,
			health: {
				totalChecks: project.totalChecks,
				successfulChecks: project.successfulChecks,
				uptimePercentage: calculateUptimePercentage(
					project.successfulChecks,
					project.totalChecks,
				),
				averageResponseTime: project.averageResponseTime,
			},
		}));
	});
}

export async function getProjectForUser(userId: string, projectId: string) {
	const since = new Date(Date.now() - HEALTH_WINDOW_MS);

	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const [project] = await tx
			.select({
				id: projects.id,
				name: projects.name,
				createdAt: projects.createdAt,
				updatedAt: projects.updatedAt,
			})
			.from(projects)
			.where(eq(projects.id, projectId))
			.limit(1);

		if (!project) {
			return null;
		}

		// The unique index allows one open incident per monitor, so this join
		// adds at most one row per monitor
		const projectMonitors = await tx
			.select({
				id: monitors.id,
				name: monitors.name,
				url: monitors.url,
				enabled: monitors.enabled,
				intervalSeconds: monitors.intervalSeconds,
				timeoutMs: monitors.timeoutMs,
				createdAt: monitors.createdAt,
				updatedAt: monitors.updatedAt,
				openIncidentStartedAt: incidents.startedAt,
				openIncidentReason: incidents.reason,
			})
			.from(monitors)
			.leftJoin(
				incidents,
				and(eq(incidents.monitorId, monitors.id), isNull(incidents.resolvedAt)),
			)
			.where(and(eq(monitors.projectId, projectId), isNull(monitors.deletedAt)))
			.orderBy(asc(monitors.createdAt));

		const [healthResult] = await tx
			.select({
				totalChecks: sql<number>`count(*)::int`,
				successfulChecks: sql<number>`(count(*) filter (where ${checkResults.status} = 'up'))::int`,
				averageResponseTime: sql<
					number | null
				>`(round(avg(${checkResults.latencyMs}) filter (where ${checkResults.status} = 'up')))::int`,
			})
			.from(checkResults)
			.innerJoin(monitors, eq(checkResults.monitorId, monitors.id))
			.where(
				and(
					eq(monitors.projectId, projectId),
					isNull(monitors.deletedAt),
					gte(checkResults.checkedAt, since),
				),
			);

		const totalChecks = healthResult?.totalChecks ?? 0;
		const successfulChecks = healthResult?.successfulChecks ?? 0;

		const monitorList = projectMonitors
			.map((monitor) => ({
				id: monitor.id,
				name: monitor.name,
				url: monitor.url,
				enabled: monitor.enabled,
				intervalSeconds: monitor.intervalSeconds,
				timeoutMs: monitor.timeoutMs,
				createdAt: monitor.createdAt.toISOString(),
				updatedAt: monitor.updatedAt.toISOString(),
				openIncident: monitor.openIncidentStartedAt
					? {
							startedAt: monitor.openIncidentStartedAt.toISOString(),
							reason: monitor.openIncidentReason ?? "",
						}
					: null,
			}))
			// Monitors with an open incident first; the sort is stable, so
			// creation order is kept within each group
			.sort(
				(a, b) =>
					Number(b.openIncident !== null) - Number(a.openIncident !== null),
			);

		const enabledCount = monitorList.filter(
			(monitor) => monitor.enabled,
		).length;

		return {
			project: {
				...project,
				createdAt: project.createdAt.toISOString(),
				updatedAt: project.updatedAt.toISOString(),
			},
			monitors: monitorList,
			counts: {
				monitors: monitorList.length,
				enabled: enabledCount,
				disabled: monitorList.length - enabledCount,
				openIncidents: monitorList.filter((monitor) => monitor.openIncident)
					.length,
			},
			health: {
				totalChecks,
				successfulChecks,
				uptimePercentage: calculateUptimePercentage(
					successfulChecks,
					totalChecks,
				),
				averageResponseTime: healthResult?.averageResponseTime ?? null,
			},
		};
	});
}
