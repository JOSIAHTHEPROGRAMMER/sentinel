import "server-only";

import { and, asc, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { incidents, monitors, projects } from "@/lib/db/schema/app";
import {
	type IncidentFilters,
	type IncidentStats,
	incidentRangeStart,
	incidentsPerDay,
} from "./incidents-shared";

const MONITOR_INCIDENTS_LIMIT = 50;
const OVERVIEW_INCIDENTS_LIMIT = 100;

export async function getIncidentsForUser(userId: string) {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const results = await tx
			.select({
				id: incidents.id,
				monitorId: incidents.monitorId,
				monitorName: monitors.name,
				monitorUrl: monitors.url,
				projectName: projects.name,
				startedAt: incidents.startedAt,
				resolvedAt: incidents.resolvedAt,
				reason: incidents.reason,
			})
			.from(incidents)
			.innerJoin(monitors, eq(incidents.monitorId, monitors.id))
			.leftJoin(projects, eq(monitors.projectId, projects.id))
			.where(isNull(monitors.deletedAt))
			.orderBy(desc(incidents.startedAt))
			.limit(100);

		return results.map((incident) => ({
			...incident,
			startedAt: incident.startedAt.toISOString(),
			resolvedAt: incident.resolvedAt?.toISOString() ?? null,
		}));
	});
}

export async function getIncidentsForMonitor(
	userId: string,
	monitorId: string,
) {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const [monitor] = await tx
			.select({ id: monitors.id })
			.from(monitors)
			.where(and(eq(monitors.id, monitorId), isNull(monitors.deletedAt)))
			.limit(1);

		if (!monitor) {
			return null;
		}

		const results = await tx
			.select({
				id: incidents.id,
				startedAt: incidents.startedAt,
				resolvedAt: incidents.resolvedAt,
				reason: incidents.reason,
			})
			.from(incidents)
			.where(eq(incidents.monitorId, monitorId))
			.orderBy(desc(incidents.startedAt))
			.limit(MONITOR_INCIDENTS_LIMIT);

		return results.map((incident) => ({
			...incident,
			startedAt: incident.startedAt.toISOString(),
			resolvedAt: incident.resolvedAt?.toISOString() ?? null,
		}));
	});
}

export async function getIncidentsOverview(
	userId: string,
	filters: IncidentFilters,
) {
	const since = incidentRangeStart(filters.range, Date.now());

	// Stats ignore the status filter, otherwise open and resolved counts would
	// always read zero for one of them
	const scope = [
		isNull(monitors.deletedAt),
		...(since ? [gte(incidents.startedAt, since)] : []),
		...(filters.monitorId ? [eq(incidents.monitorId, filters.monitorId)] : []),
		...(filters.projectId ? [eq(monitors.projectId, filters.projectId)] : []),
	];

	const listConditions = [
		...scope,
		...(filters.status === "open" ? [isNull(incidents.resolvedAt)] : []),
		...(filters.status === "resolved" ? [isNotNull(incidents.resolvedAt)] : []),
	];

	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const rows = await tx
			.select({
				id: incidents.id,
				monitorId: incidents.monitorId,
				monitorName: monitors.name,
				monitorUrl: monitors.url,
				projectName: projects.name,
				startedAt: incidents.startedAt,
				resolvedAt: incidents.resolvedAt,
				reason: incidents.reason,
			})
			.from(incidents)
			.innerJoin(monitors, eq(incidents.monitorId, monitors.id))
			.leftJoin(projects, eq(monitors.projectId, projects.id))
			.where(and(...listConditions))
			.orderBy(desc(incidents.startedAt))
			.limit(OVERVIEW_INCIDENTS_LIMIT);

		const [statsRow] = await tx
			.select({
				total: sql<number>`count(*)::int`,
				open: sql<number>`(count(*) filter (where ${incidents.resolvedAt} is null))::int`,
				resolved: sql<number>`(count(*) filter (where ${incidents.resolvedAt} is not null))::int`,
				averageResolutionMs: sql<
					number | null
				>`(avg(extract(epoch from (${incidents.resolvedAt} - ${incidents.startedAt})) * 1000) filter (where ${incidents.resolvedAt} is not null))::float8`,
			})
			.from(incidents)
			.innerJoin(monitors, eq(incidents.monitorId, monitors.id))
			.where(and(...scope));

		const monitorOptions = await tx
			.select({ id: monitors.id, name: monitors.name })
			.from(monitors)
			.where(isNull(monitors.deletedAt))
			.orderBy(asc(monitors.name));

		const projectOptions = await tx
			.select({ id: projects.id, name: projects.name })
			.from(projects)
			.orderBy(asc(projects.name));

		const total = statsRow?.total ?? 0;

		const stats: IncidentStats = {
			total,
			open: statsRow?.open ?? 0,
			resolved: statsRow?.resolved ?? 0,
			averageResolutionMs:
				statsRow?.averageResolutionMs == null
					? null
					: Math.round(statsRow.averageResolutionMs),
			perDay: incidentsPerDay(total, filters.range),
		};

		return {
			incidents: rows.map((incident) => ({
				...incident,
				startedAt: incident.startedAt.toISOString(),
				resolvedAt: incident.resolvedAt?.toISOString() ?? null,
			})),
			stats,
			monitorOptions,
			projectOptions,
		};
	});
}
