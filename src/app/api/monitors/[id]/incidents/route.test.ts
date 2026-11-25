import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, getIncidentsForMonitor } = vi.hoisted(() => ({
	getSession: vi.fn(),
	getIncidentsForMonitor: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/data/incidents", () => ({ getIncidentsForMonitor }));

import { GET } from "./route";

const monitorId = "32bc70f6-c55f-4034-8bd7-f45bc84abab0";

const session = { user: { id: "user-123" } };

const incidentList = [
	{
		id: "incident-1",
		startedAt: "2026-11-20T10:00:00.000Z",
		resolvedAt: "2026-11-20T10:30:00.000Z",
		reason: "HTTP 503",
	},
	{
		id: "incident-2",
		startedAt: "2026-11-22T08:00:00.000Z",
		resolvedAt: null,
		reason: "Request timed out",
	},
];

const context = { params: Promise.resolve({ id: monitorId }) };

async function json(response: Response) {
	return response.json();
}

beforeEach(() => {
	vi.clearAllMocks();
	getSession.mockResolvedValue(session);
	getIncidentsForMonitor.mockResolvedValue(incidentList);
});

describe("GET /api/monitors/[id]/incidents", () => {
	it("returns 401 when unauthenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await GET(new Request("http://localhost"), context);

		expect(response.status).toBe(401);
		expect(await json(response)).toEqual({ error: "Unauthorized" });
		expect(getIncidentsForMonitor).not.toHaveBeenCalled();
	});

	it("rejects an invalid monitor ID", async () => {
		const response = await GET(new Request("http://localhost"), {
			params: Promise.resolve({ id: "not-a-uuid" }),
		});

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({ error: "Invalid monitor ID" });
		expect(getIncidentsForMonitor).not.toHaveBeenCalled();
	});

	it("returns the monitor's incidents", async () => {
		const response = await GET(new Request("http://localhost"), context);

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ incidents: incidentList });
	});

	it("queries as the session user for the requested monitor", async () => {
		await GET(new Request("http://localhost"), context);

		expect(getIncidentsForMonitor).toHaveBeenCalledWith("user-123", monitorId);
	});

	it("returns an empty list for a monitor with no incidents", async () => {
		getIncidentsForMonitor.mockResolvedValue([]);

		const response = await GET(new Request("http://localhost"), context);

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ incidents: [] });
	});

	it("returns 404 when the monitor is not found", async () => {
		getIncidentsForMonitor.mockResolvedValue(null);

		const response = await GET(new Request("http://localhost"), context);

		expect(response.status).toBe(404);
		expect(await json(response)).toEqual({ error: "Monitor not found" });
	});

	it("returns 500 with a generic message when the data layer fails", async () => {
		getIncidentsForMonitor.mockRejectedValue(new Error("Database unavailable"));

		const response = await GET(new Request("http://localhost"), context);

		expect(response.status).toBe(500);
		expect(await json(response)).toEqual({
			error: "Failed to retrieve incidents",
		});
	});

	it("does not leak internal error details", async () => {
		getIncidentsForMonitor.mockRejectedValue(
			new Error("connection to 10.0.0.5 refused"),
		);

		const response = await GET(new Request("http://localhost"), context);
		const text = JSON.stringify(await json(response));

		expect(text).not.toContain("10.0.0.5");
	});
});
