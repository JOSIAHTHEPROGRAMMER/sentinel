import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, transaction, execute, select, update, checkRateLimit } =
	vi.hoisted(() => ({
		getSession: vi.fn(),
		transaction: vi.fn(),
		execute: vi.fn(),
		select: vi.fn(),
		update: vi.fn(),
		checkRateLimit: vi.fn(),
	}));

vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/db", () => ({ db: { transaction } }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/rate-limit")>()),
	checkRateLimit,
}));

import { DELETE, GET, PATCH } from "./route";

const monitorId = "32bc70f6-c55f-4034-8bd7-f45bc84abab0";
const projectId = "550e8400-e29b-41d4-a716-446655440000";

const session = {
	user: { id: "user-123" },
};

const monitor = {
	id: monitorId,
	name: "Website",
	url: "https://example.com/",
	projectId: null,
	enabled: true,
	intervalSeconds: 300,
	timeoutMs: 10000,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const project = {
	id: projectId,
};

function queryBuilder(result: unknown) {
	const promise = Promise.resolve(result);

	const methods = {
		from: vi.fn(),
		where: vi.fn(),
		orderBy: vi.fn(),
		limit: vi.fn(),
		returning: vi.fn(() => Promise.resolve(result)),
	};

	const builder: typeof methods = new Proxy(methods, {
		get(target, property, receiver) {
			if (property === "then") {
				return promise.then.bind(promise);
			}

			return Reflect.get(target, property, receiver);
		},
	});

	for (const method of [
		methods.from,
		methods.where,
		methods.orderBy,
		methods.limit,
	]) {
		method.mockImplementation(() => builder);
	}

	return builder;
}

function createTransaction(
	options: {
		selectResult?: unknown;
		selectResults?: unknown[];
		updateResult?: unknown;
	} = {},
) {
	const updateBuilder = queryBuilder(options.updateResult ?? []);
	const selectResults = options.selectResults ?? [options.selectResult ?? []];

	select.mockReset();
	select.mockImplementation(() => queryBuilder(selectResults.shift() ?? []));

	update.mockReturnValue({
		set: vi.fn(() => updateBuilder),
	});

	const tx = {
		execute,
		select,
		update,
	};

	transaction.mockImplementation(async (callback) => callback(tx));
}

function makeRequest(body: string, method: string) {
	return new Request(`http://localhost/api/monitors/${monitorId}`, {
		method,
		headers: { "Content-Type": "application/json" },
		body,
	});
}

const context = {
	params: Promise.resolve({ id: monitorId }),
};

async function json(response: Response) {
	return response.json();
}

beforeEach(() => {
	vi.clearAllMocks();
	getSession.mockResolvedValue(session);
	checkRateLimit.mockResolvedValue({ allowed: true });
	createTransaction();
});

describe("GET /api/monitors/[id]", () => {
	it("returns 401 when unauthenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await GET(new Request("http://localhost"), context);

		expect(response.status).toBe(401);
	});

	it("rejects an invalid monitor ID", async () => {
		const response = await GET(new Request("http://localhost"), {
			params: Promise.resolve({ id: "invalid-id" }),
		});

		expect(response.status).toBe(400);
		expect(transaction).not.toHaveBeenCalled();
	});

	it("returns the monitor when found", async () => {
		createTransaction({ selectResult: [monitor] });

		const response = await GET(new Request("http://localhost"), context);

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({
			monitor: {
				...monitor,
				createdAt: monitor.createdAt.toISOString(),
				updatedAt: monitor.updatedAt.toISOString(),
			},
		});
	});

	it("returns 404 when the monitor is not found", async () => {
		const response = await GET(new Request("http://localhost"), context);

		expect(response.status).toBe(404);
	});
});

describe("PATCH /api/monitors/[id]", () => {
	it("returns 401 when unauthenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await PATCH(
			makeRequest(JSON.stringify({ enabled: false }), "PATCH"),
			context,
		);

		expect(response.status).toBe(401);
	});

	it("rejects an invalid monitor ID", async () => {
		const response = await PATCH(
			makeRequest(JSON.stringify({ enabled: false }), "PATCH"),
			{
				params: Promise.resolve({ id: "invalid-id" }),
			},
		);

		expect(response.status).toBe(400);
		expect(transaction).not.toHaveBeenCalled();
	});

	it("rejects invalid JSON", async () => {
		const response = await PATCH(makeRequest("{invalid", "PATCH"), context);

		expect(response.status).toBe(400);
	});

	it("rejects an empty update", async () => {
		const response = await PATCH(
			makeRequest(JSON.stringify({}), "PATCH"),
			context,
		);

		expect(response.status).toBe(400);
		expect(update).not.toHaveBeenCalled();
	});

	it("rejects an unsupported field", async () => {
		const response = await PATCH(
			makeRequest(JSON.stringify({ ownerId: "another-user" }), "PATCH"),
			context,
		);

		expect(response.status).toBe(400);
		expect(update).not.toHaveBeenCalled();
	});

	it("updates a monitor and returns it", async () => {
		const updatedMonitor = { ...monitor, enabled: false };
		createTransaction({ updateResult: [updatedMonitor] });

		const response = await PATCH(
			makeRequest(JSON.stringify({ enabled: false }), "PATCH"),
			context,
		);

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({
			monitor: {
				...updatedMonitor,
				createdAt: updatedMonitor.createdAt.toISOString(),
				updatedAt: updatedMonitor.updatedAt.toISOString(),
			},
		});
		expect(execute).toHaveBeenCalledOnce();
		expect(update).toHaveBeenCalledOnce();
	});

	it("returns 404 when the monitor cannot be updated", async () => {
		const response = await PATCH(
			makeRequest(JSON.stringify({ enabled: false }), "PATCH"),
			context,
		);

		expect(response.status).toBe(404);
	});

	it("rejects an invalid Project ID", async () => {
		const response = await PATCH(
			makeRequest(JSON.stringify({ projectId: "invalid-id" }), "PATCH"),
			context,
		);

		expect(response.status).toBe(400);
		expect(transaction).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
	});

	it("assigns a monitor to an existing Project", async () => {
		const assignedMonitor = { ...monitor, projectId };
		createTransaction({
			selectResults: [[project]],
			updateResult: [assignedMonitor],
		});

		const response = await PATCH(
			makeRequest(JSON.stringify({ projectId }), "PATCH"),
			context,
		);

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({
			monitor: {
				...assignedMonitor,
				createdAt: assignedMonitor.createdAt.toISOString(),
				updatedAt: assignedMonitor.updatedAt.toISOString(),
			},
		});
		expect(select).toHaveBeenCalledOnce();
		expect(update).toHaveBeenCalledOnce();
	});

	it("returns 404 when the Project cannot be accessed", async () => {
		createTransaction({
			selectResults: [[]],
		});

		const response = await PATCH(
			makeRequest(JSON.stringify({ projectId }), "PATCH"),
			context,
		);

		expect(response.status).toBe(404);
		expect(await json(response)).toEqual({
			error: "Project not found",
		});
		expect(select).toHaveBeenCalledOnce();
		expect(update).not.toHaveBeenCalled();
	});

	it("unassigns a monitor from its Project", async () => {
		const unassignedMonitor = { ...monitor, projectId: null };
		createTransaction({
			updateResult: [unassignedMonitor],
		});

		const response = await PATCH(
			makeRequest(JSON.stringify({ projectId: null }), "PATCH"),
			context,
		);

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({
			monitor: {
				...unassignedMonitor,
				createdAt: unassignedMonitor.createdAt.toISOString(),
				updatedAt: unassignedMonitor.updatedAt.toISOString(),
			},
		});
		expect(select).not.toHaveBeenCalled();
		expect(update).toHaveBeenCalledOnce();
	});

	it("rejects a non-string, non-null Project ID", async () => {
		const response = await PATCH(
			makeRequest(JSON.stringify({ projectId: 123 }), "PATCH"),
			context,
		);

		expect(response.status).toBe(400);
		expect(transaction).not.toHaveBeenCalled();
	});

	it("returns 429 on PATCH and never reaches the database when rate limited", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 4 });

		const response = await PATCH(
			makeRequest(JSON.stringify({ enabled: false }), "PATCH"),
			context,
		);

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("4");
		expect(checkRateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ name: "write" }),
			session.user.id,
		);
		expect(transaction).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
	});
});

describe("DELETE /api/monitors/[id]", () => {
	it("returns 401 when unauthenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await DELETE(new Request("http://localhost"), context);

		expect(response.status).toBe(401);
	});

	it("returns 400 for an invalid monitor ID", async () => {
		const response = await DELETE(new Request("http://localhost"), {
			params: Promise.resolve({ id: "invalid-id" }),
		});

		expect(response.status).toBe(400);
		expect(transaction).not.toHaveBeenCalled();
	});

	it("soft deletes a monitor", async () => {
		createTransaction({ updateResult: [{ id: monitorId }] });

		const response = await DELETE(new Request("http://localhost"), context);

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ success: true });
		expect(update).toHaveBeenCalledOnce();
	});

	it("returns 404 when the monitor cannot be deleted", async () => {
		const response = await DELETE(new Request("http://localhost"), context);

		expect(response.status).toBe(404);
	});

	it("returns 429 on DELETE and never reaches the database when rate limited", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 4 });

		const response = await DELETE(new Request("http://localhost"), context);

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("4");
		expect(transaction).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
	});
});
