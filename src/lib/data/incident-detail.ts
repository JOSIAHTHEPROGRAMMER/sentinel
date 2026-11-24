import "server-only";

import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
	checkResults,
	incidents,
	monitors,
	projects,
} from "@/lib/db/schema/app";

const DURING_LIMIT = 100;
const RECOVERY_LIMIT = 5;

const checkColumns = {
	id: checkResults.id,
	checkedAt: checkResults.checkedAt,
	status: checkResults.status,
	httpStatus: checkResults.httpStatus,
	latencyMs: checkResults.latencyMs,
	errorMessage: checkResults.errorMessage,
};

function serializeCheck(check: {
	id: string;
	checkedAt: Date;
	status: "up" | "down" | "timeout" | "error";
	httpStatus: number | null;
	latencyMs: number | null;
	errorMessage: string | null;
}) {
	return { ...check, checkedAt: check.checkedAt.toISOString() };
}

export async function getIncidentDetail(userId: string, incidentId: string) {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const [row] = await tx
			.select({
				id: incidents.id,
				monitorId: incidents.monitorId,
				monitorName: monitors.name,
				monitorUrl: monitors.url,
				monitorEnabled: monitors.enabled,
				failureThreshold: monitors.failureThreshold,
				recoveryThreshold: monitors.recoveryThreshold,
				projectId: projects.id,
				projectName: projects.name,
				startedAt: incidents.startedAt,
				resolvedAt: incidents.resolvedAt,
				reason: incidents.reason,
			})
			.from(incidents)
			.innerJoin(monitors, eq(incidents.monitorId, monitors.id))
			.leftJoin(projects, eq(monitors.projectId, projects.id))
			.where(and(eq(incidents.id, incidentId), isNull(monitors.deletedAt)))
			.limit(1);

		if (!row) {
			return null;
		}

		// Checks recorded while the incident was open. Back-dating means this
		// starts at the first failure of the streak, not when the incident opened
		const duringScope = and(
			eq(checkResults.monitorId, row.monitorId),
			gte(checkResults.checkedAt, row.startedAt),
			...(row.resolvedAt ? [lt(checkResults.checkedAt, row.resolvedAt)] : []),
		);

		const during = await tx
			.select(checkColumns)
			.from(checkResults)
			.where(duringScope)
			.orderBy(asc(checkResults.checkedAt))
			.limit(DURING_LIMIT);

		const [duringCounts] = await tx
			.select({
				total: sql<number>`count(*)::int`,
				failed: sql<number>`(count(*) filter (where ${checkResults.status} <> 'up'))::int`,
			})
			.from(checkResults)
			.where(duringScope);

		// The first checks at or after the resolution show the recovery
		const recovery = row.resolvedAt
			? await tx
					.select(checkColumns)
					.from(checkResults)
					.where(
						and(
							eq(checkResults.monitorId, row.monitorId),
							gte(checkResults.checkedAt, row.resolvedAt),
						),
					)
					.orderBy(asc(checkResults.checkedAt))
					.limit(RECOVERY_LIMIT)
			: [];

		return {
			incident: {
				id: row.id,
				reason: row.reason,
				startedAt: row.startedAt.toISOString(),
				resolvedAt: row.resolvedAt?.toISOString() ?? null,
			},
			monitor: {
				id: row.monitorId,
				name: row.monitorName,
				url: row.monitorUrl,
				enabled: row.monitorEnabled,
				failureThreshold: row.failureThreshold,
				recoveryThreshold: row.recoveryThreshold,
			},
			project: row.projectId
				? { id: row.projectId, name: row.projectName ?? "" }
				: null,
			during: {
				checks: during.map(serializeCheck),
				total: duringCounts?.total ?? 0,
				failed: duringCounts?.failed ?? 0,
			},
			recovery: recovery.map(serializeCheck),
		};
	});
}
