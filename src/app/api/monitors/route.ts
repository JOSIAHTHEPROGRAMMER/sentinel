import { eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { monitors, projects } from "@/lib/db/schema/app";
import {
	checkRateLimit,
	rateLimitResponse,
	WRITE_POLICY,
} from "@/lib/rate-limit";
import { validateMonitorUrl } from "@/lib/validation/monitor-url";

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_MONITORS_PER_USER = 50;
const MAX_BODY_BYTES = 8 * 1024;
const ALLOWED_FIELDS = ["name", "url", "projectId"];

export async function POST(request: Request) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const rateLimit = await checkRateLimit(WRITE_POLICY, session.user.id);

	if (!rateLimit.allowed) {
		return rateLimitResponse(rateLimit.retryAfterSeconds);
	}

	const declaredLength = Number(request.headers.get("content-length"));

	if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
		return NextResponse.json(
			{ error: "Request body too large" },
			{ status: 413 },
		);
	}

	let body: unknown;

	try {
		const raw = await request.text();

		if (raw.length > MAX_BODY_BYTES) {
			return NextResponse.json(
				{ error: "Request body too large" },
				{ status: 413 },
			);
		}

		body = JSON.parse(raw);
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

	if (Object.keys(body).some((key) => !ALLOWED_FIELDS.includes(key))) {
		return NextResponse.json(
			{ error: "Only name, url and projectId are supported" },
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

	let projectId: string | null = null;

	if ("projectId" in body && body.projectId !== null) {
		if (
			typeof body.projectId !== "string" ||
			!UUID_REGEX.test(body.projectId)
		) {
			return NextResponse.json(
				{ error: "Invalid project ID" },
				{ status: 400 },
			);
		}

		projectId = body.projectId;
	}

	const result = await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${session.user.id}, true)`,
		);

		const [usage] = await tx
			.select({ total: sql<number>`count(*)::int` })
			.from(monitors)
			.where(isNull(monitors.deletedAt));

		if ((usage?.total ?? 0) >= MAX_MONITORS_PER_USER) {
			return { status: "limit" as const };
		}

		if (projectId) {
			const [project] = await tx
				.select({ id: projects.id })
				.from(projects)
				.where(eq(projects.id, projectId))
				.limit(1);

			if (!project) {
				return { status: "no-project" as const };
			}
		}

		const [createdMonitor] = await tx
			.insert(monitors)
			.values({
				ownerId: session.user.id,
				projectId,
				name,
				url: urlResult.url,
			})
			.returning({
				id: monitors.id,
				projectId: monitors.projectId,
				name: monitors.name,
				url: monitors.url,
				enabled: monitors.enabled,
				createdAt: monitors.createdAt,
			});

		return { status: "created" as const, monitor: createdMonitor };
	});

	if (result.status === "limit") {
		return NextResponse.json(
			{
				error: `You can have up to ${MAX_MONITORS_PER_USER} monitors. Delete one to add another.`,
			},
			{ status: 403 },
		);
	}

	if (result.status === "no-project") {
		return NextResponse.json({ error: "Project not found" }, { status: 404 });
	}

	return NextResponse.json({ monitor: result.monitor }, { status: 201 });
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
				projectId: monitors.projectId,
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
