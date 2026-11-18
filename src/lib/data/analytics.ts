import "server-only";

import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkResults, incidents, monitors } from "@/lib/db/schema/app";
import {
	type AnalyticsRange,
	type AnalyticsSummary,
	calculateUptimePercentage,
	rangeToMs,
} from "./analytics-shared";

export async function getAnalyticsSummary(
	userId: string,
	range: AnalyticsRange,
): Promise<AnalyticsSummary> {
	const since = new Date(Date.now() - rangeToMs(range));
	const sinceIso = since.toISOString();

	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const [checks] = await tx
			.select({
				total: sql<number>`count(*)::int`,
				successful: sql<number>`(count(*) filter (where ${checkResults.status} = 'up'))::int`,
				averageLatencyMs: sql<
					number | null
				>`(round(avg(${checkResults.latencyMs}) filter (where ${checkResults.status} = 'up')))::int`,
			})
			.from(checkResults)
			.innerJoin(monitors, eq(monitors.id, checkResults.monitorId))
			.where(
				and(isNull(monitors.deletedAt), gte(checkResults.checkedAt, since)),
			);

		const [incidentStats] = await tx
			.select({
				open: sql<number>`(count(*) filter (where ${incidents.resolvedAt} is null))::int`,
				started: sql<number>`(count(*) filter (where ${incidents.startedAt} >= ${sinceIso}::timestamptz))::int`,
				resolved: sql<number>`(count(*) filter (where ${incidents.resolvedAt} >= ${sinceIso}::timestamptz))::int`,
			})
			.from(incidents)
			.innerJoin(monitors, eq(monitors.id, incidents.monitorId))
			.where(isNull(monitors.deletedAt));

		const totalChecks = checks?.total ?? 0;
		const successfulChecks = checks?.successful ?? 0;

		return {
			range,
			totalChecks,
			successfulChecks,
			failedChecks: totalChecks - successfulChecks,
			uptimePercentage: calculateUptimePercentage(
				successfulChecks,
				totalChecks,
			),
			averageResponseTimeMs: checks?.averageLatencyMs ?? null,
			openIncidents: incidentStats?.open ?? 0,
			incidentsStarted: incidentStats?.started ?? 0,
			incidentsResolved: incidentStats?.resolved ?? 0,
		};
	});
}
