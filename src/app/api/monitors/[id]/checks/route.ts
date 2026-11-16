import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { checkResults, monitors } from "@/lib/db/schema/app";

type RouteContext = {
	params: Promise<{ id: string }>;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HISTORY_LIMIT = 50;

export async function GET(_request: Request, { params }: RouteContext) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	if (!UUID_PATTERN.test(id)) {
		return NextResponse.json({ error: "Invalid monitor ID" }, { status: 400 });
	}

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

		const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

		const [summaryResult] = await tx
			.select({
				totalChecks: sql<number>`count(*)::int`,
				successfulChecks: sql<number>`count(*) filter (where ${checkResults.status} = 'up')::int`,
				averageResponseTime: sql<
					number | null
				>`round(avg(${checkResults.latencyMs}) filter (where ${checkResults.latencyMs} is not null))::int`,
			})
			.from(checkResults)
			.where(
				and(eq(checkResults.monitorId, id), gte(checkResults.checkedAt, since)),
			);

		const performanceChecks = await tx
			.select({
				id: checkResults.id,
				checkedAt: checkResults.checkedAt,
				status: checkResults.status,
				latencyMs: checkResults.latencyMs,
			})
			.from(checkResults)
			.where(
				and(eq(checkResults.monitorId, id), gte(checkResults.checkedAt, since)),
			)
			.orderBy(desc(checkResults.checkedAt))
			.limit(HISTORY_LIMIT);

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

		const totalChecks = summaryResult?.totalChecks ?? 0;
		const successfulChecks = summaryResult?.successfulChecks ?? 0;

		return {
			checks,
			performanceChecks,
			summary: {
				totalChecks,
				successfulChecks,
				uptimePercentage:
					totalChecks > 0
						? Number(((successfulChecks / totalChecks) * 100).toFixed(2))
						: null,
				averageResponseTime: summaryResult?.averageResponseTime ?? null,
			},
		};
	});

	if (!result) {
		return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
	}

	return NextResponse.json(result);
}
