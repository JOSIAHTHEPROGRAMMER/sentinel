import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, transaction, execute, select, update } = vi.hoisted(() => ({
	getSession: vi.fn(),
	transaction: vi.fn(),
	execute: vi.fn(),
	select: vi.fn(),
	update: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/db", () => ({ db: { transaction } }));

import { DELETE, GET, PATCH } from "./route";

const monitorId = "32bc70f6-c55f-4034-8bd7-f45bc84abab0";

const session = {
	user: { id: "user-123" },
};

const monitor = {
	id: monitorId,
	name: "Website",
	url: "https://example.com/",
	enabled: true,
	intervalSeconds: 300,
	timeoutMs: 10000,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
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

	let builder: typeof methods;

	builder = new Proxy(methods, {
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
	options: { selectResult?: unknown; updateResult?: unknown } = {},
) {
	const selectBuilder = queryBuilder(options.selectResult ?? []);
	const updateBuilder = queryBuilder(options.updateResult ?? []);

	select.mockReturnValue(selectBuilder);

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
});
