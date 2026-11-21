import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getProjectForUser } from "@/lib/data/projects";
import { db } from "@/lib/db";
import { monitors, projects } from "@/lib/db/schema/app";
import {
	checkRateLimit,
	rateLimitResponse,
	WRITE_POLICY,
} from "@/lib/rate-limit";

type RouteContext = {
	params: Promise<{ id: string }>;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: RouteContext) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	if (!UUID_PATTERN.test(id)) {
		return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
	}

	const result = await getProjectForUser(session.user.id, id);

	if (!result) {
		return NextResponse.json({ error: "Project not found" }, { status: 404 });
	}

	return NextResponse.json(result);
}

export async function PATCH(request: Request, { params }: RouteContext) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	const rateLimit = await checkRateLimit(WRITE_POLICY, session.user.id);

	if (!rateLimit.allowed) {
		return rateLimitResponse(rateLimit.retryAfterSeconds);
	}

	if (!UUID_PATTERN.test(id)) {
		return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
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
		Array.isArray(body) ||
		!("name" in body) ||
		typeof body.name !== "string" ||
		Object.keys(body).some((key) => key !== "name")
	) {
		return NextResponse.json(
			{ error: "A valid project name is required" },
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

	const updatedProject = await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${session.user.id}, true)`,
		);

		const [project] = await tx
			.update(projects)
			.set({
				name,
				updatedAt: new Date(),
			})
			.where(eq(projects.id, id))
			.returning({
				id: projects.id,
				name: projects.name,
				createdAt: projects.createdAt,
				updatedAt: projects.updatedAt,
			});

		return project;
	});

	if (!updatedProject) {
		return NextResponse.json({ error: "Project not found" }, { status: 404 });
	}

	return NextResponse.json({
		project: {
			...updatedProject,
			createdAt: updatedProject.createdAt.toISOString(),
			updatedAt: updatedProject.updatedAt.toISOString(),
		},
	});
}

export async function DELETE(_request: Request, { params }: RouteContext) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	const rateLimit = await checkRateLimit(WRITE_POLICY, session.user.id);

	if (!rateLimit.allowed) {
		return rateLimitResponse(rateLimit.retryAfterSeconds);
	}

	if (!UUID_PATTERN.test(id)) {
		return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
	}

	const deleted = await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${session.user.id}, true)`,
		);

		const [project] = await tx
			.select({ id: projects.id })
			.from(projects)
			.where(eq(projects.id, id))
			.limit(1);

		if (!project) {
			return false;
		}

		await tx
			.update(monitors)
			.set({ projectId: null })
			.where(eq(monitors.projectId, id));

		await tx.delete(projects).where(eq(projects.id, id));

		return true;
	});

	if (!deleted) {
		return NextResponse.json({ error: "Project not found" }, { status: 404 });
	}

	return NextResponse.json({ success: true });
}
