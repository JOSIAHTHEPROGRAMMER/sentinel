import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, getUserSettings, saveUserSettings, checkRateLimit } =
	vi.hoisted(() => ({
		getSession: vi.fn(),
		getUserSettings: vi.fn(),
		saveUserSettings: vi.fn(),
		checkRateLimit: vi.fn(),
	}));

vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/data/user-settings", () => ({
	getUserSettings,
	saveUserSettings,
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/rate-limit")>()),
	checkRateLimit,
}));

import { GET, PUT } from "./route";

const session = {
	user: { id: "user-123" },
};

const settings = { defaultIntervalSeconds: 120, defaultTimeoutMs: 5_000 };

function putRequest(body: string, headers: Record<string, string> = {}) {
	return new Request("http://localhost/api/settings", {
		method: "PUT",
		headers,
		body,
	});
}

async function json(response: Response) {
	return response.json();
}

beforeEach(() => {
	vi.clearAllMocks();
	getSession.mockResolvedValue(session);
	checkRateLimit.mockResolvedValue({ allowed: true });
	getUserSettings.mockResolvedValue(settings);
	saveUserSettings.mockImplementation(async (_userId, value) => value);
});

describe("GET /api/settings", () => {
	it("returns 401 when the user is not authenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await GET();

		expect(response.status).toBe(401);
		expect(await json(response)).toEqual({ error: "Unauthorized" });
		expect(getUserSettings).not.toHaveBeenCalled();
	});

	it("returns the settings for the signed-in user only", async () => {
		const response = await GET();

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ settings });
		expect(getUserSettings).toHaveBeenCalledWith("user-123");
	});
});

describe("PUT /api/settings", () => {
	it("returns 401 when the user is not authenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await PUT(putRequest(JSON.stringify(settings)));

		expect(response.status).toBe(401);
		expect(saveUserSettings).not.toHaveBeenCalled();
	});

	it("does not consult the limiter for unauthenticated requests", async () => {
		getSession.mockResolvedValue(null);

		await PUT(putRequest(JSON.stringify(settings)));

		expect(checkRateLimit).not.toHaveBeenCalled();
	});

	it("rate limits by user id", async () => {
		await PUT(putRequest(JSON.stringify(settings)));

		expect(checkRateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ name: "write" }),
			"user-123",
		);
	});

	it("returns 429 with Retry-After and never saves when limited", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 8 });

		const response = await PUT(putRequest(JSON.stringify(settings)));

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("8");
		expect(saveUserSettings).not.toHaveBeenCalled();
	});

	it("rejects invalid JSON", async () => {
		const response = await PUT(putRequest("{invalid"));

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({ error: "Invalid JSON body" });
		expect(saveUserSettings).not.toHaveBeenCalled();
	});

	it("rejects an oversized body", async () => {
		const response = await PUT(
			putRequest(JSON.stringify({ ...settings, padding: "a".repeat(2_000) })),
		);

		expect(response.status).toBe(413);
		expect(saveUserSettings).not.toHaveBeenCalled();
	});

	it("rejects a body whose declared length is too large", async () => {
		const response = await PUT(
			putRequest(JSON.stringify(settings), { "content-length": "100000" }),
		);

		expect(response.status).toBe(413);
		expect(saveUserSettings).not.toHaveBeenCalled();
	});

	it("rejects values outside the allowed ranges", async () => {
		const response = await PUT(
			putRequest(
				JSON.stringify({ defaultIntervalSeconds: 5, defaultTimeoutMs: 5_000 }),
			),
		);

		expect(response.status).toBe(400);
		expect((await json(response)).error).toContain("Interval");
		expect(saveUserSettings).not.toHaveBeenCalled();
	});

	it("rejects an attempt to supply a user id", async () => {
		const response = await PUT(
			putRequest(JSON.stringify({ ...settings, userId: "another-user" })),
		);

		expect(response.status).toBe(400);
		expect(saveUserSettings).not.toHaveBeenCalled();
	});

	it("saves valid settings under the session user and returns them", async () => {
		const response = await PUT(putRequest(JSON.stringify(settings)));

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ settings });
		expect(saveUserSettings).toHaveBeenCalledOnce();
		expect(saveUserSettings).toHaveBeenCalledWith("user-123", settings);
	});
});
