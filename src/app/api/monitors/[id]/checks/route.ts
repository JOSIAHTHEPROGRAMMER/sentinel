import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
	bucketSecondsForRange,
	buildBucketStarts,
	calculateUptimePercentage,
	parseAnalyticsRange,
	rangeToMs,
} from "@/lib/data/analytics-shared";
import { db } from "@/lib/db";
import { checkResults, monitors } from "@/lib/db/schema/app";

type RouteContext = {
	params: Promise<{ id: string }>;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HISTORY_LIMIT = 50;

export async function GET(request: Request, { params }: RouteContext) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	if (!UUID_PATTERN.test(id)) {
		return NextResponse.json({ error: "Invalid monitor ID" }, { status: 400 });
	}

	const range = parseAnalyticsRange(
		new URL(request.url).searchParams.get("range") ?? undefined,
	);

	const now = Date.now();
	const since = new Date(now - rangeToMs(range));
	const bucketSeconds = bucketSecondsForRange(range);
	const bucketStarts = buildBucketStarts(range, now);
	const chartSince = new Date(bucketStarts[0] ?? since.getTime());

	const result = await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${session.user.id}, true)`,
		);

		const [monitor] = await tx
			.select({ id: monitors.id })
			.from(monitors)
			.where(and(eq(monitors.id, id), isNull(monitors.deletedAt)))
			.limit(1);

		if (!monitor) {
			return null;
		}

		const [summaryResult] = await tx
			.select({
				totalChecks: sql<number>`count(*)::int`,
				successfulChecks: sql<number>`(count(*) filter (where ${checkResults.status} = 'up'))::int`,
				averageLatencyMs: sql<
					number | null
				>`(round(avg(${checkResults.latencyMs}) filter (where ${checkResults.status} = 'up')))::int`,
			})
			.from(checkResults)
			.where(
				and(eq(checkResults.monitorId, id), gte(checkResults.checkedAt, since)),
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
					eq(checkResults.monitorId, id),
					gte(checkResults.checkedAt, chartSince),
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
			.where(eq(checkResults.monitorId, id))
			.orderBy(desc(checkResults.checkedAt))
			.limit(HISTORY_LIMIT);

		const rowsByStart = new Map(
			bucketRows.map((row) => [row.bucket * bucketSeconds * 1000, row]),
		);

		const buckets = bucketStarts.map((start) => {
			const row = rowsByStart.get(start);

			return {
				start: new Date(start).toISOString(),
				total: row?.total ?? 0,
				successful: row?.successful ?? 0,
				averageLatencyMs: row?.averageLatencyMs ?? null,
			};
		});

		const totalChecks = summaryResult?.totalChecks ?? 0;
		const successfulChecks = summaryResult?.successfulChecks ?? 0;

		return {
			checks,
			buckets,
			summary: {
				range,
				totalChecks,
				successfulChecks,
				failedChecks: totalChecks - successfulChecks,
				uptimePercentage: calculateUptimePercentage(
					successfulChecks,
					totalChecks,
				),
				averageResponseTimeMs: summaryResult?.averageLatencyMs ?? null,
			},
		};
	});

	if (!result) {
		return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
	}

	return NextResponse.json(result);
}
