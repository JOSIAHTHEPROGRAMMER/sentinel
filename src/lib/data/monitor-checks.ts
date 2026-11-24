import "server-only";

import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkResults, incidents, monitors } from "@/lib/db/schema/app";
import { fillBuckets } from "./analytics-buckets";
import {
	bucketSecondsForSpan,
	buildBucketStartsForWindow,
	calculateUptimePercentage,
	type TimeWindow,
} from "./analytics-shared";
import { deriveMonitorStatus } from "./monitor-status";

const HISTORY_LIMIT = 50;

export async function getMonitorChecksData(
	userId: string,
	monitorId: string,
	window: TimeWindow,
	now: number,
) {
	const bucketSeconds = bucketSecondsForSpan(window.endMs - window.startMs);
	const starts = buildBucketStartsForWindow(window, bucketSeconds);
	const windowStart = new Date(window.startMs);
	const windowEnd = new Date(window.endMs);
	const chartStart = new Date(starts[0] ?? window.startMs);

	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const [monitor] = await tx
			.select({
				id: monitors.id,
				enabled: monitors.enabled,
				intervalSeconds: monitors.intervalSeconds,
				updatedAt: monitors.updatedAt,
			})
			.from(monitors)
			.where(and(eq(monitors.id, monitorId), isNull(monitors.deletedAt)))
			.limit(1);

		if (!monitor) {
			return null;
		}

		const [summaryRow] = await tx
			.select({
				totalChecks: sql<number>`count(*)::int`,
				successfulChecks: sql<number>`(count(*) filter (where ${checkResults.status} = 'up'))::int`,
				averageLatencyMs: sql<
					number | null
				>`(round(avg(${checkResults.latencyMs}) filter (where ${checkResults.status} = 'up')))::int`,
			})
			.from(checkResults)
			.where(
				and(
					eq(checkResults.monitorId, monitorId),
					gte(checkResults.checkedAt, windowStart),
					lte(checkResults.checkedAt, windowEnd),
				),
			);

		const bucketIndex = sql<number>`floor(extract(epoch from ${checkResults.checkedAt}) / ${sql.raw(String(bucketSeconds))})::int`;

		const bucketRows = await tx
			.select({
				bucket: bucketIndex,
				total: sql<number>`count(*)::int`,
				successful: sql<number>`(count(*) filter (where ${checkResults.status} = 'up'))::int`,
				averageLatencyMs: sql<
					number | null
				>`(round(avg(${checkResults.latencyMs}) filter (where ${checkResults.status} = 'up')))::int`,
			})
			.from(checkResults)
			.where(
				and(
					eq(checkResults.monitorId, monitorId),
					gte(checkResults.checkedAt, chartStart),
					lte(checkResults.checkedAt, windowEnd),
				),
			)
			.groupBy(bucketIndex)
			.orderBy(bucketIndex);

		const checks = await tx
			.select({
				id: checkResults.id,
				checkedAt: checkResults.checkedAt,
				status: checkResults.status,
				httpStatus: checkResults.httpStatus,
				latencyMs: checkResults.latencyMs,
				errorMessage: checkResults.errorMessage,
			})
			.from(checkResults)
			.where(eq(checkResults.monitorId, monitorId))
			.orderBy(desc(checkResults.checkedAt))
			.limit(HISTORY_LIMIT);

		const [latest] = await tx
			.select({
				status: checkResults.status,
				checkedAt: checkResults.checkedAt,
			})
			.from(checkResults)
			.where(eq(checkResults.monitorId, monitorId))
			.orderBy(desc(checkResults.checkedAt))
			.limit(1);

		const [lastSuccess] = await tx
			.select({ checkedAt: checkResults.checkedAt })
			.from(checkResults)
			.where(
				and(
					eq(checkResults.monitorId, monitorId),
					eq(checkResults.status, "up"),
				),
			)
			.orderBy(desc(checkResults.checkedAt))
			.limit(1);

		const [lastIncident] = await tx
			.select({
				id: incidents.id,
				startedAt: incidents.startedAt,
				resolvedAt: incidents.resolvedAt,
				reason: incidents.reason,
			})
			.from(incidents)
			.where(eq(incidents.monitorId, monitorId))
			.orderBy(desc(incidents.startedAt))
			.limit(1);

		const totalChecks = summaryRow?.totalChecks ?? 0;
		const successfulChecks = summaryRow?.successfulChecks ?? 0;

		return {
			overview: {
				status: deriveMonitorStatus(
					{
						enabled: monitor.enabled,
						intervalSeconds: monitor.intervalSeconds,
						updatedAt: monitor.updatedAt.toISOString(),
						latestCheckedAt: latest?.checkedAt.toISOString() ?? null,
						latestStatus: latest?.status ?? null,
					},
					now,
				),
				latestCheckedAt: latest?.checkedAt.toISOString() ?? null,
				lastSuccessAt: lastSuccess?.checkedAt.toISOString() ?? null,
				lastIncident: lastIncident
					? {
							id: lastIncident.id,
							startedAt: lastIncident.startedAt.toISOString(),
							resolvedAt: lastIncident.resolvedAt?.toISOString() ?? null,
							reason: lastIncident.reason,
						}
					: null,
			},
			summary: {
				totalChecks,
				successfulChecks,
				failedChecks: totalChecks - successfulChecks,
				uptimePercentage: calculateUptimePercentage(
					successfulChecks,
					totalChecks,
				),
				averageResponseTimeMs: summaryRow?.averageLatencyMs ?? null,
			},
			buckets: fillBuckets(bucketRows, starts, bucketSeconds),
			checks,
		};
	});
}
