import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { computePurgeAfter, getGraceMinutes } from "@/lib/account-deletion";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/auth/session";
import {
	cancelAccountDeletion,
	getPendingDeletion,
	requestAccountDeletion,
} from "@/lib/data/account-deletion";
import {
	checkRateLimit,
	rateLimitResponse,
	WRITE_POLICY,
} from "@/lib/rate-limit";
import { validateDeletionRequest } from "@/lib/validation/account-deletion";

const MAX_BODY_BYTES = 1024;

// The request endpoint checks a password, so it gets a much tighter budget
const DELETION_POLICY = {
	name: "account-deletion",
	requests: 5,
	window: "10 m",
} as const;

export async function GET() {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const pending = await getPendingDeletion(session.user.id);

	return NextResponse.json({ pending });
}

export async function POST(request: Request) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const rateLimit = await checkRateLimit(DELETION_POLICY, session.user.id);

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

	const validation = validateDeletionRequest(body, session.user.email);

	if (!validation.valid) {
		return NextResponse.json({ error: validation.error }, { status: 400 });
	}

	const requestHeaders = await headers();

	try {
		await auth.api.verifyPassword({
			body: { password: validation.password },
			headers: requestHeaders,
		});
	} catch {
		// One generic answer for every failure, so this can't be used to probe passwords
		return NextResponse.json(
			{ error: "The password you entered is incorrect" },
			{ status: 403 },
		);
	}

	const purgeAfter = computePurgeAfter(new Date(), getGraceMinutes());
	const result = await requestAccountDeletion(session.user.id, purgeAfter);

	try {
		await auth.api.revokeSessions({ headers: requestHeaders });
	} catch (error) {
		// The request is already recorded and reversible, so report success anyway
		console.error("Failed to revoke sessions after deletion request:", error);
	}

	return NextResponse.json(
		{
			pending: {
				requestedAt: result.requestedAt,
				purgeAfter: result.purgeAfter,
			},
		},
		{ status: result.created ? 201 : 200 },
	);
}

export async function DELETE() {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const rateLimit = await checkRateLimit(WRITE_POLICY, session.user.id);

	if (!rateLimit.allowed) {
		return rateLimitResponse(rateLimit.retryAfterSeconds);
	}

	const cancelled = await cancelAccountDeletion(session.user.id);

	if (!cancelled) {
		return NextResponse.json(
			{ error: "There is no pending deletion to cancel" },
			{ status: 404 },
		);
	}

	return NextResponse.json({ success: true });
}
