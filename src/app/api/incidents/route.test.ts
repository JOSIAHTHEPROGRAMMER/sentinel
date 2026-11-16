import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, transaction, execute, select } = vi.hoisted(() => ({
	getSession: vi.fn(),
	transaction: vi.fn(),
	execute: vi.fn(),
	select: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/db", () => ({ db: { transaction } }));

import { GET } from "./route";

const session = {
	user: { id: "user-123" },
};

function queryBuilder(result: unknown) {
	const promise = Promise.resolve(result);

	const methods = {
		from: vi.fn(),
		innerJoin: vi.fn(),
		where: vi.fn(),
		orderBy: vi.fn(),
		limit: vi.fn(),
	};

	const builder = new Proxy(methods, {
		get(target, property, receiver) {
			if (property === "then") {
				return promise.then.bind(promise);
			}

			return Reflect.get(target, property, receiver);
		},
	});

	for (const method of Object.values(methods)) {
		method.mockImplementation(() => builder);
	}

	return builder;
}

function createTransaction(selectResult: unknown = []) {
	const selectBuilder = queryBuilder(selectResult);

	select.mockReturnValue(selectBuilder);

	const tx = {
		execute,
		select,
	};

	transaction.mockImplementation(async (callback) => callback(tx));
}

function createRequest(status?: string) {
	const url = new URL("http://localhost/api/incidents");

	if (status !== undefined) {
		url.searchParams.set("status", status);
	}

	return new Request(url);
}

async function json(response: Response) {
	return response.json();
}

describe("GET /api/incidents", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getSession.mockResolvedValue(session);
		createTransaction();
	});

	it("returns 401 when the user is not authenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await GET(createRequest());

		expect(response.status).toBe(401);
		expect(await json(response)).toEqual({
			error: "Unauthorized",
		});
		expect(transaction).not.toHaveBeenCalled();
	});

	it("returns the authenticated user's incidents", async () => {
		const incidents = [
			{
				id: "incident-1",
				monitorId: "monitor-1",
				monitorName: "Website",
				monitorUrl: "https://example.com",
				startedAt: "2026-01-01T00:00:00.000Z",
				resolvedAt: null,
				reason: "HTTP 500",
			},
		];

		createTransaction(incidents);

		const response = await GET(createRequest());

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ incidents });
		expect(execute).toHaveBeenCalledOnce();
		expect(select).toHaveBeenCalledOnce();
	});

	it("returns open incidents when the status is open", async () => {
		const incidents = [
			{
				id: "incident-1",
				monitorId: "monitor-1",
				monitorName: "Website",
				monitorUrl: "https://example.com",
				startedAt: "2026-01-01T00:00:00.000Z",
				resolvedAt: null,
				reason: "HTTP 500",
			},
		];

		createTransaction(incidents);

		const response = await GET(createRequest("open"));

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ incidents });
		expect(execute).toHaveBeenCalledOnce();
		expect(select).toHaveBeenCalledOnce();
	});

	it("returns resolved incidents when the status is resolved", async () => {
		const incidents = [
			{
				id: "incident-2",
				monitorId: "monitor-1",
				monitorName: "Website",
				monitorUrl: "https://example.com",
				startedAt: "2026-01-01T00:00:00.000Z",
				resolvedAt: "2026-01-01T01:00:00.000Z",
				reason: "HTTP 500",
			},
		];

		createTransaction(incidents);

		const response = await GET(createRequest("resolved"));

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ incidents });
		expect(execute).toHaveBeenCalledOnce();
		expect(select).toHaveBeenCalledOnce();
	});

	it("rejects an invalid status parameter", async () => {
		const response = await GET(createRequest("invalid"));

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({
			error: "Status must be open or resolved",
		});
		expect(transaction).not.toHaveBeenCalled();
	});

	it("returns 500 when the database query fails", async () => {
		transaction.mockRejectedValue(new Error("Database error"));

		const response = await GET(createRequest());

		expect(response.status).toBe(500);
		expect(await json(response)).toEqual({
			error: "Failed to retrieve incidents",
		});
	});
});
