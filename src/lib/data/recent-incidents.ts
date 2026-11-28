import "server-only";

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { incidents, monitors } from "@/lib/db/schema/app";

const OPEN_LIMIT = 20;
const RESOLVED_LIMIT = 5;

export type RecentIncident = {
	id: string;
	monitorId: string;
	monitorName: string;
	startedAt: string;
	resolvedAt: string | null;
	reason: string;
};

const columns = {
	id: incidents.id,
	monitorId: incidents.monitorId,
	monitorName: monitors.name,
	startedAt: incidents.startedAt,
	resolvedAt: incidents.resolvedAt,
	reason: incidents.reason,
};

function serialize(row: {
	id: string;
	monitorId: string;
	monitorName: string;
	startedAt: Date;
	resolvedAt: Date | null;
	reason: string;
}): RecentIncident {
	return {
		...row,
		startedAt: row.startedAt.toISOString(),
		resolvedAt: row.resolvedAt?.toISOString() ?? null,
	};
}

// Every open incident, plus the latest few resolved ones
export async function getRecentIncidents(userId: string) {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const open = await tx
			.select(columns)
			.from(incidents)
			.innerJoin(monitors, eq(incidents.monitorId, monitors.id))
			.where(and(isNull(incidents.resolvedAt), isNull(monitors.deletedAt)))
			.orderBy(desc(incidents.startedAt))
			.limit(OPEN_LIMIT);

		const resolved = await tx
			.select(columns)
			.from(incidents)
			.innerJoin(monitors, eq(incidents.monitorId, monitors.id))
			.where(and(isNotNull(incidents.resolvedAt), isNull(monitors.deletedAt)))
			.orderBy(desc(incidents.startedAt))
			.limit(RESOLVED_LIMIT);

		return { open: open.map(serialize), resolved: resolved.map(serialize) };
	});
}
