import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, transaction, execute, insert, select, values } = vi.hoisted(
	() => ({
		getSession: vi.fn(),
		transaction: vi.fn(),
		execute: vi.fn(),
		insert: vi.fn(),
		select: vi.fn(),
		values: vi.fn(),
	}),
);

vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/db", () => ({ db: { transaction } }));

import { GET, POST } from "./route";

const session = {
	user: { id: "user-123" },
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

	for (const method of [
		methods.from,
		methods.where,
		methods.orderBy,
		methods.limit,
	]) {
		method.mockImplementation(() => builder);
	}

	const builder = new Proxy(methods, {
		get(target, property, receiver) {
			if (property === "then") {
				return promise.then.bind(promise);
			}

			return Reflect.get(target, property, receiver);
		},
	});

	return builder;
}

function createTransaction(
	options: { insertResult?: unknown; selectResult?: unknown } = {},
) {
	const insertBuilder = queryBuilder(options.insertResult ?? []);
	const selectBuilder = queryBuilder(options.selectResult ?? []);

	values.mockReturnValue(insertBuilder);
	insert.mockReturnValue({ values });
	select.mockReturnValue(selectBuilder);

	const tx = {
		execute,
		insert,
		select,
	};

	transaction.mockImplementation(async (callback) => callback(tx));
}

async function json(response: Response) {
	return response.json();
}

describe("GET /api/monitors", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getSession.mockResolvedValue(session);
		createTransaction();
	});

	it("returns 401 when the user is not authenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await GET();

		expect(response.status).toBe(401);
		expect(await json(response)).toEqual({ error: "Unauthorized" });
	});

	it("returns the authenticated user's monitors", async () => {
		const monitors = [
			{
				id: "monitor-1",
				projectId: "project-1",
				name: "Website",
				url: "https://example.com/",
				enabled: true,
			},
		];

		createTransaction({ selectResult: monitors });

		const response = await GET();

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ monitors });
		expect(execute).toHaveBeenCalledOnce();
		expect(select).toHaveBeenCalledOnce();
	});
});

describe("POST /api/monitors", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getSession.mockResolvedValue(session);
		createTransaction();
	});

	it("returns 401 when the user is not authenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await POST(
			new Request("http://localhost/api/monitors", {
				method: "POST",
				body: JSON.stringify({
					name: "Website",
					url: "https://example.com",
				}),
			}),
		);

		expect(response.status).toBe(401);
	});

	it("rejects invalid JSON", async () => {
		const response = await POST(
			new Request("http://localhost/api/monitors", {
				method: "POST",
				body: "{invalid",
			}),
		);

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({ error: "Invalid JSON body" });
	});

	it("rejects a missing monitor name or URL", async () => {
		const response = await POST(
			new Request("http://localhost/api/monitors", {
				method: "POST",
				body: JSON.stringify({ name: "Website" }),
			}),
		);

		expect(response.status).toBe(400);
	});

	it("creates a standalone monitor and returns 201", async () => {
		const monitor = {
			id: "monitor-1",
			projectId: null,
			name: "Website",
			url: "https://example.com/",
			enabled: true,
			createdAt: new Date("2026-01-01T00:00:00Z"),
		};

		createTransaction({ insertResult: [monitor] });

		const response = await POST(
			new Request("http://localhost/api/monitors", {
				method: "POST",
				body: JSON.stringify({
					name: " Website ",
					url: "https://example.com",
				}),
			}),
		);

		expect(response.status).toBe(201);
		expect(await json(response)).toEqual({
			monitor: {
				...monitor,
				createdAt: monitor.createdAt.toISOString(),
			},
		});
		expect(execute).toHaveBeenCalledOnce();
		expect(insert).toHaveBeenCalledOnce();
		expect(values).toHaveBeenCalledWith({
			ownerId: session.user.id,
			projectId: null,
			name: "Website",
			url: "https://example.com/",
		});
		expect(select).not.toHaveBeenCalled();
	});

	it("creates a monitor assigned to an existing Project", async () => {
		const monitor = {
			id: "monitor-1",
			projectId: "550e8400-e29b-41d4-a716-446655440000",
			name: "API Health",
			url: "https://example.com/api/health",
			enabled: true,
			createdAt: new Date("2026-01-01T00:00:00Z"),
		};

		createTransaction({
			insertResult: [monitor],
			selectResult: [{ id: "550e8400-e29b-41d4-a716-446655440000" }],
		});

		const response = await POST(
			new Request("http://localhost/api/monitors", {
				method: "POST",
				body: JSON.stringify({
					name: "API Health",
					url: "https://example.com/api/health",
					projectId: "550e8400-e29b-41d4-a716-446655440000",
				}),
			}),
		);

		expect(response.status).toBe(201);
		expect(await json(response)).toEqual({
			monitor: {
				...monitor,
				createdAt: monitor.createdAt.toISOString(),
			},
		});
		expect(select).toHaveBeenCalledOnce();
		expect(values).toHaveBeenCalledWith({
			ownerId: session.user.id,
			projectId: "550e8400-e29b-41d4-a716-446655440000",
			name: "API Health",
			url: "https://example.com/api/health",
		});
	});

	it("rejects an invalid Project ID", async () => {
		const response = await POST(
			new Request("http://localhost/api/monitors", {
				method: "POST",
				body: JSON.stringify({
					name: "API Health",
					url: "https://example.com/api/health",
					projectId: "invalid-id",
				}),
			}),
		);

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({ error: "Invalid project ID" });
		expect(insert).not.toHaveBeenCalled();
	});

	it("rejects a Project that does not belong to the user", async () => {
		createTransaction({ selectResult: [] });

		const response = await POST(
			new Request("http://localhost/api/monitors", {
				method: "POST",
				body: JSON.stringify({
					name: "API Health",
					url: "https://example.com/api/health",
					projectId: "11111111-1111-4111-8111-111111111111",
				}),
			}),
		);

		expect(response.status).toBe(404);
		expect(await json(response)).toEqual({ error: "Project not found" });
		expect(select).toHaveBeenCalledOnce();
		expect(insert).not.toHaveBeenCalled();
	});

	it("rejects an invalid URL", async () => {
		const response = await POST(
			new Request("http://localhost/api/monitors", {
				method: "POST",
				body: JSON.stringify({
					name: "Website",
					url: "not-a-valid-url",
				}),
			}),
		);

		expect(response.status).toBe(400);
		expect(insert).not.toHaveBeenCalled();
	});
});
