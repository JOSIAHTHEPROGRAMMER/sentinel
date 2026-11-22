import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserSettings, saveUserSettings } from "@/lib/data/user-settings";
import {
	checkRateLimit,
	rateLimitResponse,
	WRITE_POLICY,
} from "@/lib/rate-limit";
import { validateUserSettings } from "@/lib/validation/user-settings";

const MAX_BODY_BYTES = 1024;

export async function GET() {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const settings = await getUserSettings(session.user.id);

	return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
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

	const result = validateUserSettings(body);

	if (!result.valid) {
		return NextResponse.json({ error: result.error }, { status: 400 });
	}

	const settings = await saveUserSettings(session.user.id, result.settings);

	return NextResponse.json({ settings });
}
