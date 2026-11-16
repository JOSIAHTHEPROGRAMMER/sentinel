import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { incidents, monitors } from "@/lib/db/schema/app";

export async function GET(request: Request) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const status = new URL(request.url).searchParams.get("status");

	if (status !== null && status !== "open" && status !== "resolved") {
		return NextResponse.json(
			{ error: "Status must be open or resolved" },
			{ status: 400 },
		);
	}

	try {
		const incidentsList = await db.transaction(async (tx) => {
			await tx.execute(
				sql`SELECT set_config('app.user_id', ${session.user.id}, true)`,
			);

			const conditions = [
				isNull(monitors.deletedAt),
				...(status === "open" ? [isNull(incidents.resolvedAt)] : []),
				...(status === "resolved" ? [isNotNull(incidents.resolvedAt)] : []),
			];

			return tx
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
				.where(and(...conditions))
				.orderBy(desc(incidents.startedAt))
				.limit(100);
		});

		return NextResponse.json({ incidents: incidentsList });
	} catch {
		return NextResponse.json(
			{ error: "Failed to retrieve incidents" },
			{ status: 500 },
		);
	}
}
