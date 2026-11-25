import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, getMonitorChecksData } = vi.hoisted(() => ({
	getSession: vi.fn(),
	getMonitorChecksData: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/data/monitor-checks", () => ({ getMonitorChecksData }));

import { GET } from "./route";

const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);
const DAY = 86_400_000;

const monitorId = "32bc70f6-c55f-4034-8bd7-f45bc84abab0";

const session = { user: { id: "user-123" } };

const data = {
	overview: { status: "up" },
	summary: { totalChecks: 3 },
	buckets: [],
	checks: [],
};

const context = { params: Promise.resolve({ id: monitorId }) };

function request(query = "") {
	return new Request(
		`http://localhost/api/monitors/${monitorId}/checks${query}`,
	);
}

async function json(response: Response) {
	return response.json();
}

function lastCall() {
	const [userId, id, window, now] =
		getMonitorChecksData.mock.calls.at(-1) ?? [];

	return { userId, id, window, now };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);

	getSession.mockResolvedValue(session);
	getMonitorChecksData.mockResolvedValue(data);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("GET /api/monitors/[id]/checks", () => {
	it("returns 401 when unauthenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await GET(request(), context);

		expect(response.status).toBe(401);
		expect(getMonitorChecksData).not.toHaveBeenCalled();
	});

	it("rejects an invalid monitor ID", async () => {
		const response = await GET(request(), {
			params: Promise.resolve({ id: "not-a-uuid" }),
		});

		expect(response.status).toBe(400);
		expect(getMonitorChecksData).not.toHaveBeenCalled();
	});

	it("returns 404 when the monitor is not found", async () => {
		getMonitorChecksData.mockResolvedValue(null);

		const response = await GET(request(), context);

		expect(response.status).toBe(404);
		expect(await json(response)).toEqual({ error: "Monitor not found" });
	});

	it("queries as the session user, never a user from the request", async () => {
		await GET(request(`?userId=another-user`), context);

		expect(lastCall().userId).toBe("user-123");
		expect(lastCall().id).toBe(monitorId);
	});

	it("defaults to the last 24 hours", async () => {
		const response = await GET(request(), context);
		const body = await json(response);

		expect(lastCall().window).toEqual({ startMs: NOW - DAY, endMs: NOW });
		expect(body.range).toBe("24h");
	});

	it("supports the 7 day and 30 day presets", async () => {
		await GET(request("?range=7d"), context);
		expect(lastCall().window).toEqual({ startMs: NOW - 7 * DAY, endMs: NOW });

		await GET(request("?range=30d"), context);
		expect(lastCall().window).toEqual({ startMs: NOW - 30 * DAY, endMs: NOW });
	});

	it("falls back to 24 hours for an unknown range", async () => {
		const response = await GET(request("?range=banana"), context);

		expect(lastCall().window).toEqual({ startMs: NOW - DAY, endMs: NOW });
		expect((await json(response)).range).toBe("24h");
	});

	it("passes the current time to the data layer", async () => {
		await GET(request(), context);

		expect(lastCall().now).toBe(NOW);
	});

	it("accepts a valid custom window", async () => {
		const from = new Date(NOW - 3 * DAY).toISOString();
		const to = new Date(NOW - 1 * DAY).toISOString();

		const response = await GET(request(`?from=${from}&to=${to}`), context);
		const body = await json(response);

		expect(response.status).toBe(200);
		expect(lastCall().window).toEqual({
			startMs: NOW - 3 * DAY,
			endMs: NOW - 1 * DAY,
		});
		expect(body.range).toBe("custom");
		expect(body.windowStart).toBe(from);
		expect(body.windowEnd).toBe(to);
	});

	it("clamps a custom window ending in the future to now", async () => {
		const from = new Date(NOW - 2 * DAY).toISOString();
		const to = new Date(NOW + 5 * DAY).toISOString();

		await GET(request(`?from=${from}&to=${to}`), context);

		expect(lastCall().window).toEqual({ startMs: NOW - 2 * DAY, endMs: NOW });
	});

	it("prefers a custom window over a preset range", async () => {
		const from = new Date(NOW - 3 * DAY).toISOString();
		const to = new Date(NOW - 1 * DAY).toISOString();

		const response = await GET(
			request(`?range=30d&from=${from}&to=${to}`),
			context,
		);

		expect((await json(response)).range).toBe("custom");
	});

	it("rejects a custom window with only one end", async () => {
		const from = new Date(NOW - 3 * DAY).toISOString();

		const response = await GET(request(`?from=${from}`), context);

		expect(response.status).toBe(400);
		expect(getMonitorChecksData).not.toHaveBeenCalled();
	});

	it("rejects unparseable dates", async () => {
		const response = await GET(request("?from=banana&to=also-banana"), context);

		expect(response.status).toBe(400);
		expect(getMonitorChecksData).not.toHaveBeenCalled();
	});

	it("rejects a custom window under one hour", async () => {
		const from = new Date(NOW - 30 * 60_000).toISOString();
		const to = new Date(NOW).toISOString();

		const response = await GET(request(`?from=${from}&to=${to}`), context);

		expect(response.status).toBe(400);
		expect((await json(response)).error).toContain("1 hour");
	});

	it("rejects a custom window over 90 days", async () => {
		const from = new Date(NOW - 91 * DAY).toISOString();
		const to = new Date(NOW).toISOString();

		const response = await GET(request(`?from=${from}&to=${to}`), context);

		expect(response.status).toBe(400);
		expect((await json(response)).error).toContain("90 days");
	});

	it("rejects a start after the end", async () => {
		const from = new Date(NOW - 1 * DAY).toISOString();
		const to = new Date(NOW - 3 * DAY).toISOString();

		const response = await GET(request(`?from=${from}&to=${to}`), context);

		expect(response.status).toBe(400);
	});

	it("returns the data layer result alongside the window", async () => {
		const response = await GET(request("?range=7d"), context);
		const body = await json(response);

		expect(response.status).toBe(200);
		expect(body).toMatchObject(data);
		expect(body.windowStart).toBe(new Date(NOW - 7 * DAY).toISOString());
		expect(body.windowEnd).toBe(new Date(NOW).toISOString());
	});
});
