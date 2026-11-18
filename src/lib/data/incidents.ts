import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { incidents, monitors, projects } from "@/lib/db/schema/app";

const MONITOR_INCIDENTS_LIMIT = 50;

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
