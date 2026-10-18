import { isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { monitors } from "@/lib/db/schema/app";
import { validateMonitorUrl } from "@/lib/validation/monitor-url";

export async function POST(request: Request) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (
		typeof body !== "object" ||
		body === null ||
		!("name" in body) ||
		!("url" in body) ||
		typeof body.name !== "string" ||
		typeof body.url !== "string"
	) {
		return NextResponse.json(
			{ error: "A monitor name and URL are required" },
			{ status: 400 },
		);
	}

	const name = body.name.trim();

	if (name.length < 1 || name.length > 100) {
		return NextResponse.json(
			{ error: "Name must be between 1 and 100 characters" },
			{ status: 400 },
		);
	}

	const urlResult = validateMonitorUrl(body.url);

	if (!urlResult.valid) {
		return NextResponse.json({ error: urlResult.error }, { status: 400 });
	}

	const monitor = await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${session.user.id}, true)`,
		);

		const [createdMonitor] = await tx
			.insert(monitors)
			.values({
				ownerId: session.user.id,
				name,
				url: urlResult.url,
			})
			.returning({
				id: monitors.id,
				name: monitors.name,
				url: monitors.url,
				enabled: monitors.enabled,
				createdAt: monitors.createdAt,
			});

		return createdMonitor;
	});

	return NextResponse.json({ monitor }, { status: 201 });
}

export async function GET() {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const userMonitors = await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${session.user.id}, true)`,
		);

		return tx
			.select({
				id: monitors.id,
				name: monitors.name,
				url: monitors.url,
				enabled: monitors.enabled,
				intervalSeconds: monitors.intervalSeconds,
				timeoutMs: monitors.timeoutMs,
				createdAt: monitors.createdAt,
				updatedAt: monitors.updatedAt,
			})
			.from(monitors)
			.where(isNull(monitors.deletedAt))
			.orderBy(monitors.createdAt);
	});

	return NextResponse.json({ monitors: userMonitors });
}
