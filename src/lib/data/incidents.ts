import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { incidents, monitors } from "@/lib/db/schema/app";

export async function getIncidentsForUser(userId: string) {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const results = await tx
			.select({
				id: incidents.id,
				monitorId: incidents.monitorId,
				monitorName: monitors.name,
				monitorUrl: monitors.url,
				startedAt: incidents.startedAt,
				resolvedAt: incidents.resolvedAt,
				reason: incidents.reason,
			})
			.from(incidents)
			.innerJoin(monitors, eq(incidents.monitorId, monitors.id))
			.where(and(isNull(monitors.deletedAt)))
			.orderBy(desc(incidents.startedAt))
			.limit(100);

		return results.map((incident) => ({
			...incident,
			startedAt: incident.startedAt.toISOString(),
			resolvedAt: incident.resolvedAt?.toISOString() ?? null,
		}));
	});
}
