import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { monitors, projects } from "@/lib/db/schema/app";
import { validateMonitorUrl } from "@/lib/validation/monitor-url";

type RouteContext = {
	params: Promise<{ id: string }>;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: RouteContext) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	if (!UUID_PATTERN.test(id)) {
		return NextResponse.json({ error: "Invalid monitor ID" }, { status: 400 });
	}

	const monitor = await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${session.user.id}, true)`,
		);

		const [result] = await tx
			.select({
				id: monitors.id,
				name: monitors.name,
				url: monitors.url,
				projectId: monitors.projectId,
				enabled: monitors.enabled,
				intervalSeconds: monitors.intervalSeconds,
				timeoutMs: monitors.timeoutMs,
				createdAt: monitors.createdAt,
				updatedAt: monitors.updatedAt,
			})
			.from(monitors)
			.where(and(eq(monitors.id, id), isNull(monitors.deletedAt)))
			.limit(1);

		return result;
	});

	if (!monitor) {
		return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
	}

	return NextResponse.json({ monitor });
}

export async function PATCH(request: Request, { params }: RouteContext) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	if (!UUID_PATTERN.test(id)) {
		return NextResponse.json({ error: "Invalid monitor ID" }, { status: 400 });
	}

	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return NextResponse.json(
			{ error: "Request body must be an object" },
			{ status: 400 },
		);
	}

	const input = body as Record<string, unknown>;
	const allowedFields = [
		"name",
		"url",
		"enabled",
		"intervalSeconds",
		"timeoutMs",
		"projectId",
	];

	const keys = Object.keys(input);

	if (keys.length === 0 || keys.some((key) => !allowedFields.includes(key))) {
		return NextResponse.json(
			{ error: "Provide valid, supported fields to update" },
			{ status: 400 },
		);
	}

	const updates: {
		name?: string;
		url?: string;
		enabled?: boolean;
		intervalSeconds?: number;
		timeoutMs?: number;
		projectId?: string | null;
		updatedAt?: Date;
	} = {};

	if ("name" in input) {
		if (
			typeof input.name !== "string" ||
			input.name.trim().length < 1 ||
			input.name.trim().length > 100
		) {
			return NextResponse.json(
				{ error: "Name must be between 1 and 100 characters" },
				{ status: 400 },
			);
		}

		updates.name = input.name.trim();
	}

	if ("url" in input) {
		const urlResult = validateMonitorUrl(input.url);

		if (!urlResult.valid) {
			return NextResponse.json({ error: urlResult.error }, { status: 400 });
		}

		updates.url = urlResult.url;
	}

	if ("enabled" in input) {
		if (typeof input.enabled !== "boolean") {
			return NextResponse.json(
				{ error: "Enabled must be a boolean" },
				{ status: 400 },
			);
		}

		updates.enabled = input.enabled;
	}

	if ("intervalSeconds" in input) {
		if (
			typeof input.intervalSeconds !== "number" ||
			!Number.isInteger(input.intervalSeconds) ||
			input.intervalSeconds < 60 ||
			input.intervalSeconds > 86400
		) {
			return NextResponse.json(
				{ error: "Interval must be between 60 and 86400 seconds" },
				{ status: 400 },
			);
		}

		updates.intervalSeconds = input.intervalSeconds;
	}

	if ("timeoutMs" in input) {
		if (
			typeof input.timeoutMs !== "number" ||
			!Number.isInteger(input.timeoutMs) ||
			input.timeoutMs < 1000 ||
			input.timeoutMs > 30000
		) {
			return NextResponse.json(
				{ error: "Timeout must be between 1000 and 30000 milliseconds" },
				{ status: 400 },
			);
		}

		updates.timeoutMs = input.timeoutMs;
	}

	if ("projectId" in input) {
		if (
			input.projectId !== null &&
			(typeof input.projectId !== "string" ||
				!UUID_PATTERN.test(input.projectId))
		) {
			return NextResponse.json(
				{ error: "Invalid project ID" },
				{ status: 400 },
			);
		}

		updates.projectId = input.projectId as string | null;
	}

	updates.updatedAt = new Date();

	const result = await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${session.user.id}, true)`,
		);

		if (updates.projectId) {
			const [project] = await tx
				.select({ id: projects.id })
				.from(projects)
				.where(eq(projects.id, updates.projectId))
				.limit(1);

			if (!project) {
				return { projectNotFound: true as const, monitor: null };
			}
		}

		const [updatedMonitor] = await tx
			.update(monitors)
			.set(updates)
			.where(and(eq(monitors.id, id), isNull(monitors.deletedAt)))
			.returning({
				id: monitors.id,
				name: monitors.name,
				url: monitors.url,
				projectId: monitors.projectId,
				enabled: monitors.enabled,
				intervalSeconds: monitors.intervalSeconds,
				timeoutMs: monitors.timeoutMs,
				updatedAt: monitors.updatedAt,
			});

		return {
			projectNotFound: false as const,
			monitor: updatedMonitor ?? null,
		};
	});

	if (result.projectNotFound) {
		return NextResponse.json({ error: "Project not found" }, { status: 404 });
	}

	if (!result.monitor) {
		return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
	}

	return NextResponse.json({ monitor: result.monitor });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	if (!UUID_PATTERN.test(id)) {
		return NextResponse.json({ error: "Invalid monitor ID" }, { status: 400 });
	}

	const deletedMonitor = await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${session.user.id}, true)`,
		);

		const [result] = await tx
			.update(monitors)
			.set({
				deletedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(and(eq(monitors.id, id), isNull(monitors.deletedAt)))
			.returning({
				id: monitors.id,
			});

		return result;
	});

	if (!deletedMonitor) {
		return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
	}

	return NextResponse.json({ success: true });
}
