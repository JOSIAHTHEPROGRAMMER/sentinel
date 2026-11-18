import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getIncidentsForMonitor } from "@/lib/data/incidents";

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
		return NextResponse.json({ error: "Invalid monitor ID" }, { status: 400 });
	}

	try {
		const incidents = await getIncidentsForMonitor(session.user.id, id);

		if (!incidents) {
			return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
		}

		return NextResponse.json({ incidents });
	} catch {
		return NextResponse.json(
			{ error: "Failed to retrieve incidents" },
			{ status: 500 },
		);
	}
}
