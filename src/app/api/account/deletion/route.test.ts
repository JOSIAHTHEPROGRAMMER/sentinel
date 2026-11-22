import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getSession,
	verifyPassword,
	revokeSessions,
	getPendingDeletion,
	requestAccountDeletion,
	cancelAccountDeletion,
	checkRateLimit,
} = vi.hoisted(() => ({
	getSession: vi.fn(),
	verifyPassword: vi.fn(),
	revokeSessions: vi.fn(),
	getPendingDeletion: vi.fn(),
	requestAccountDeletion: vi.fn(),
	cancelAccountDeletion: vi.fn(),
	checkRateLimit: vi.fn(),
}));

vi.mock("next/headers", () => ({
	headers: vi.fn(async () => new Headers({ cookie: "session=abc" })),
}));
vi.mock("@/lib/auth", () => ({
	auth: { api: { verifyPassword, revokeSessions } },
}));
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/data/account-deletion", () => ({
	getPendingDeletion,
	requestAccountDeletion,
	cancelAccountDeletion,
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/rate-limit")>()),
	checkRateLimit,
}));

import { DELETE, GET, POST } from "./route";

const session = {
	user: { id: "user-123", email: "owner@example.com" },
};

const pending = {
	requestedAt: "2026-11-22T12:00:00.000Z",
	purgeAfter: "2026-12-22T12:00:00.000Z",
};

function postRequest(body: string, headers: Record<string, string> = {}) {
	return new Request("http://localhost/api/account/deletion", {
		method: "POST",
		headers,
		body,
	});
}

const validBody = JSON.stringify({
	password: "my-current-password",
	email: "owner@example.com",
});

async function json(response: Response) {
	return response.json();
}

beforeEach(() => {
	vi.clearAllMocks();
	getSession.mockResolvedValue(session);
	checkRateLimit.mockResolvedValue({ allowed: true });
	verifyPassword.mockResolvedValue({ status: true });
	revokeSessions.mockResolvedValue({ status: true });
	getPendingDeletion.mockResolvedValue(pending);
	requestAccountDeletion.mockResolvedValue({ ...pending, created: true });
	cancelAccountDeletion.mockResolvedValue(true);
});

describe("GET /api/account/deletion", () => {
	it("returns 401 when unauthenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await GET();

		expect(response.status).toBe(401);
		expect(getPendingDeletion).not.toHaveBeenCalled();
	});

	it("returns the pending request for the signed-in user only", async () => {
		const response = await GET();

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ pending });
		expect(getPendingDeletion).toHaveBeenCalledWith("user-123");
	});

	it("returns null when nothing is pending", async () => {
		getPendingDeletion.mockResolvedValue(null);

		const response = await GET();

		expect(await json(response)).toEqual({ pending: null });
	});
});

describe("POST /api/account/deletion", () => {
	it("returns 401 when unauthenticated and never consults the limiter", async () => {
		getSession.mockResolvedValue(null);

		const response = await POST(postRequest(validBody));

		expect(response.status).toBe(401);
		expect(checkRateLimit).not.toHaveBeenCalled();
		expect(verifyPassword).not.toHaveBeenCalled();
	});

	it("rate limits by user id with the dedicated deletion policy", async () => {
		await POST(postRequest(validBody));

		expect(checkRateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ name: "account-deletion" }),
			"user-123",
		);
	});

	it("returns 429 with Retry-After and does nothing else when limited", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });

		const response = await POST(postRequest(validBody));

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("30");
		expect(verifyPassword).not.toHaveBeenCalled();
		expect(requestAccountDeletion).not.toHaveBeenCalled();
	});

	it("rejects an oversized body", async () => {
		const response = await POST(
			postRequest(
				JSON.stringify({
					password: "a".repeat(2_000),
					email: "owner@example.com",
				}),
			),
		);

		expect(response.status).toBe(413);
		expect(verifyPassword).not.toHaveBeenCalled();
	});

	it("rejects a body whose declared length is too large", async () => {
		const response = await POST(
			postRequest(validBody, { "content-length": "100000" }),
		);

		expect(response.status).toBe(413);
		expect(verifyPassword).not.toHaveBeenCalled();
	});

	it("rejects invalid JSON", async () => {
		const response = await POST(postRequest("{invalid"));

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({ error: "Invalid JSON body" });
		expect(verifyPassword).not.toHaveBeenCalled();
	});

	it("rejects a typed email that does not match the session email", async () => {
		const response = await POST(
			postRequest(
				JSON.stringify({
					password: "my-current-password",
					email: "someone-else@example.com",
				}),
			),
		);

		expect(response.status).toBe(400);
		expect(verifyPassword).not.toHaveBeenCalled();
		expect(requestAccountDeletion).not.toHaveBeenCalled();
	});

	it("rejects unsupported fields such as a user id", async () => {
		const response = await POST(
			postRequest(
				JSON.stringify({
					password: "my-current-password",
					email: "owner@example.com",
					userId: "another-user",
				}),
			),
		);

		expect(response.status).toBe(400);
		expect(requestAccountDeletion).not.toHaveBeenCalled();
	});

	it("returns one generic 403 for a wrong password and records nothing", async () => {
		verifyPassword.mockRejectedValue(new Error("Invalid password"));

		const response = await POST(postRequest(validBody));

		expect(response.status).toBe(403);
		expect(await json(response)).toEqual({
			error: "The password you entered is incorrect",
		});
		expect(requestAccountDeletion).not.toHaveBeenCalled();
		expect(revokeSessions).not.toHaveBeenCalled();
	});

	it("verifies the password with the caller's session headers", async () => {
		await POST(postRequest(validBody));

		expect(verifyPassword).toHaveBeenCalledWith({
			body: { password: "my-current-password" },
			headers: expect.any(Headers),
		});
	});

	it("records the request for the session user, with a future purge date", async () => {
		const before = Date.now();

		const response = await POST(postRequest(validBody));

		expect(response.status).toBe(201);
		expect(await json(response)).toEqual({ pending });
		expect(requestAccountDeletion).toHaveBeenCalledOnce();

		const [userId, purgeAfter] = requestAccountDeletion.mock.calls[0];

		expect(userId).toBe("user-123");
		expect(purgeAfter).toBeInstanceOf(Date);
		expect(purgeAfter.getTime()).toBeGreaterThan(before);
	});

	it("revokes all sessions after recording the request", async () => {
		await POST(postRequest(validBody));

		expect(revokeSessions).toHaveBeenCalledWith({
			headers: expect.any(Headers),
		});
		expect(requestAccountDeletion.mock.invocationCallOrder[0]).toBeLessThan(
			revokeSessions.mock.invocationCallOrder[0],
		);
	});

	it("returns 200 and keeps the original dates when a request already exists", async () => {
		requestAccountDeletion.mockResolvedValue({ ...pending, created: false });

		const response = await POST(postRequest(validBody));

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ pending });
	});

	it("still reports success when revoking sessions fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		revokeSessions.mockRejectedValue(new Error("Session store unavailable"));

		const response = await POST(postRequest(validBody));

		expect(response.status).toBe(201);
		expect(consoleError).toHaveBeenCalled();

		consoleError.mockRestore();
	});
});

describe("DELETE /api/account/deletion", () => {
	it("returns 401 when unauthenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await DELETE();

		expect(response.status).toBe(401);
		expect(cancelAccountDeletion).not.toHaveBeenCalled();
	});

	it("returns 429 and cancels nothing when rate limited", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 5 });

		const response = await DELETE();

		expect(response.status).toBe(429);
		expect(cancelAccountDeletion).not.toHaveBeenCalled();
	});

	it("cancels the pending deletion for the signed-in user", async () => {
		const response = await DELETE();

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ success: true });
		expect(cancelAccountDeletion).toHaveBeenCalledWith("user-123");
	});

	it("returns 404 when there is nothing to cancel", async () => {
		cancelAccountDeletion.mockResolvedValue(false);

		const response = await DELETE();

		expect(response.status).toBe(404);
	});
});
