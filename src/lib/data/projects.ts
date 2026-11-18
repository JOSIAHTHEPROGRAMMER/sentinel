import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkResults, monitors, projects } from "@/lib/db/schema/app";
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

		return results.map((project) => ({
			id: project.id,
			name: project.name,
			createdAt: project.createdAt.toISOString(),
			updatedAt: project.updatedAt.toISOString(),
			monitorCount: project.monitorCount,
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
			})
			.from(monitors)
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

		return {
			project: {
				...project,
				createdAt: project.createdAt.toISOString(),
				updatedAt: project.updatedAt.toISOString(),
			},
			monitors: projectMonitors.map((monitor) => ({
				...monitor,
				createdAt: monitor.createdAt.toISOString(),
				updatedAt: monitor.updatedAt.toISOString(),
			})),
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
