import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { monitors } from "@/lib/db/schema/app";

type RouteContext = {
	params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	const isUuid =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

	if (!isUuid) {
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
				enabled: monitors.enabled,
				intervalSeconds: monitors.intervalSeconds,
				timeoutMs: monitors.timeoutMs,
				createdAt: monitors.createdAt,
				updatedAt: monitors.updatedAt,
			})
			.from(monitors)
			.where(eq(monitors.id, id))
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

	const isUuid =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

	if (!isUuid) {
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
		if (typeof input.url !== "string" || input.url.trim().length > 2048) {
			return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
		}

		let parsedUrl: URL;

		try {
			parsedUrl = new URL(input.url.trim());
		} catch {
			return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
		}

		const hostname = parsedUrl.hostname.toLowerCase();

		if (
			!["http:", "https:"].includes(parsedUrl.protocol) ||
			parsedUrl.username !== "" ||
			parsedUrl.password !== "" ||
			hostname === "localhost" ||
			hostname.endsWith(".localhost") ||
			hostname.endsWith(".local") ||
			hostname.endsWith(".internal")
		) {
			return NextResponse.json(
				{ error: "URL is not allowed" },
				{ status: 400 },
			);
		}

		updates.url = parsedUrl.toString();
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

	updates.updatedAt = new Date();

	const updatedMonitor = await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${session.user.id}, true)`,
		);

		const [result] = await tx
			.update(monitors)
			.set(updates)
			.where(eq(monitors.id, id))
			.returning({
				id: monitors.id,
				name: monitors.name,
				url: monitors.url,
				enabled: monitors.enabled,
				intervalSeconds: monitors.intervalSeconds,
				timeoutMs: monitors.timeoutMs,
				updatedAt: monitors.updatedAt,
			});

		return result;
	});

	if (!updatedMonitor) {
		return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
	}

	return NextResponse.json({ monitor: updatedMonitor });
}
