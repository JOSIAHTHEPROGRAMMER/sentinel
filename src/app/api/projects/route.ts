import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getProjectsForUser } from "@/lib/data/projects";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema/app";

export async function GET() {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const userProjects = await getProjectsForUser(session.user.id);

	return NextResponse.json({ projects: userProjects });
}

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
		Array.isArray(body) ||
		!("name" in body) ||
		typeof body.name !== "string"
	) {
		return NextResponse.json(
			{ error: "A project name is required" },
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

	const project = await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${session.user.id}, true)`,
		);

		const [createdProject] = await tx
			.insert(projects)
			.values({
				ownerId: session.user.id,
				name,
			})
			.returning({
				id: projects.id,
				name: projects.name,
				createdAt: projects.createdAt,
				updatedAt: projects.updatedAt,
			});

		return createdProject;
	});

	return NextResponse.json({ project }, { status: 201 });
}
