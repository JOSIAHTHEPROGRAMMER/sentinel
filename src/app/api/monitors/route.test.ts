import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getSession,
	transaction,
	execute,
	insert,
	select,
	values,
	checkRateLimit,
} = vi.hoisted(() => ({
	getSession: vi.fn(),
	transaction: vi.fn(),
	execute: vi.fn(),
	insert: vi.fn(),
	select: vi.fn(),
	values: vi.fn(),
	checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/db", () => ({ db: { transaction } }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/rate-limit")>()),
	checkRateLimit,
}));

import { GET, POST } from "./route";

const session = {
	user: { id: "user-123" },
};

const projectId = "550e8400-e29b-41d4-a716-446655440000";

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
	options: {
		insertResult?: unknown;
		selectResult?: unknown;
		selectResults?: unknown[];
	} = {},
) {
	const insertBuilder = queryBuilder(options.insertResult ?? []);

	// Each select call consumes the next result; POST selects the monitor count first
	const selectQueue = [
		...(options.selectResults ??
			(options.selectResult !== undefined
				? [options.selectResult]
				: [[{ total: 0 }]])),
	];

	select.mockReset();
	select.mockImplementation(() => queryBuilder(selectQueue.shift() ?? []));

	values.mockReturnValue(insertBuilder);
	insert.mockReturnValue({ values });

	const tx = {
		execute,
		insert,
		select,
	};

	transaction.mockImplementation(async (callback) => callback(tx));
}

function postRequest(body: string, headers: Record<string, string> = {}) {
	return new Request("http://localhost/api/monitors", {
		method: "POST",
		headers,
		body,
	});
}

async function json(response: Response) {
	return response.json();
}

describe("GET /api/monitors", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getSession.mockResolvedValue(session);
		checkRateLimit.mockResolvedValue({ allowed: true });
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
		checkRateLimit.mockResolvedValue({ allowed: true });

		createTransaction();
	});

	it("returns 401 when the user is not authenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await POST(
			postRequest(
				JSON.stringify({
					name: "Website",
					url: "https://example.com",
				}),
			),
		);

		expect(response.status).toBe(401);
	});

	it("rejects invalid JSON", async () => {
		const response = await POST(postRequest("{invalid"));

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({ error: "Invalid JSON body" });
	});

	it("rejects a missing monitor name or URL", async () => {
		const response = await POST(
			postRequest(JSON.stringify({ name: "Website" })),
		);

		expect(response.status).toBe(400);
	});

	it("rejects unsupported fields", async () => {
		const response = await POST(
			postRequest(
				JSON.stringify({
					name: "Website",
					url: "https://example.com",
					ownerId: "another-user",
				}),
			),
		);

		expect(response.status).toBe(400);
		expect(transaction).not.toHaveBeenCalled();
		expect(insert).not.toHaveBeenCalled();
	});

	it("rejects an oversized body", async () => {
		const response = await POST(
			postRequest(
				JSON.stringify({
					name: "a".repeat(9_000),
					url: "https://example.com",
				}),
			),
		);

		expect(response.status).toBe(413);
		expect(transaction).not.toHaveBeenCalled();
	});

	it("rejects a body whose declared length is too large", async () => {
		const response = await POST(
			postRequest(
				JSON.stringify({ name: "Website", url: "https://example.com" }),
				{ "content-length": "100000" },
			),
		);

		expect(response.status).toBe(413);
		expect(transaction).not.toHaveBeenCalled();
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
			postRequest(
				JSON.stringify({
					name: " Website ",
					url: "https://example.com",
				}),
			),
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
		expect(select).toHaveBeenCalledOnce();
	});

	it("creates a monitor assigned to an existing Project", async () => {
		const monitor = {
			id: "monitor-1",
			projectId,
			name: "API Health",
			url: "https://example.com/api/health",
			enabled: true,
			createdAt: new Date("2026-01-01T00:00:00Z"),
		};

		createTransaction({
			insertResult: [monitor],
			selectResults: [[{ total: 0 }], [{ id: projectId }]],
		});

		const response = await POST(
			postRequest(
				JSON.stringify({
					name: "API Health",
					url: "https://example.com/api/health",
					projectId,
				}),
			),
		);

		expect(response.status).toBe(201);
		expect(await json(response)).toEqual({
			monitor: {
				...monitor,
				createdAt: monitor.createdAt.toISOString(),
			},
		});
		expect(select).toHaveBeenCalledTimes(2);
		expect(values).toHaveBeenCalledWith({
			ownerId: session.user.id,
			projectId,
			name: "API Health",
			url: "https://example.com/api/health",
		});
	});

	it("rejects an invalid Project ID", async () => {
		const response = await POST(
			postRequest(
				JSON.stringify({
					name: "API Health",
					url: "https://example.com/api/health",
					projectId: "invalid-id",
				}),
			),
		);

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({ error: "Invalid project ID" });
		expect(insert).not.toHaveBeenCalled();
	});

	it("rejects a Project that does not belong to the user", async () => {
		createTransaction({ selectResults: [[{ total: 0 }], []] });

		const response = await POST(
			postRequest(
				JSON.stringify({
					name: "API Health",
					url: "https://example.com/api/health",
					projectId: "11111111-1111-4111-8111-111111111111",
				}),
			),
		);

		expect(response.status).toBe(404);
		expect(await json(response)).toEqual({ error: "Project not found" });
		expect(select).toHaveBeenCalledTimes(2);
		expect(insert).not.toHaveBeenCalled();
	});

	it("rejects an invalid URL", async () => {
		const response = await POST(
			postRequest(
				JSON.stringify({
					name: "Website",
					url: "not-a-valid-url",
				}),
			),
		);

		expect(response.status).toBe(400);
		expect(insert).not.toHaveBeenCalled();
	});

	it("rejects creation when the user has reached the monitor limit", async () => {
		createTransaction({ selectResults: [[{ total: 50 }]] });

		const response = await POST(
			postRequest(
				JSON.stringify({ name: "Website", url: "https://example.com" }),
			),
		);

		expect(response.status).toBe(403);
		expect((await json(response)).error).toContain("50 monitors");
		expect(select).toHaveBeenCalledOnce();
		expect(insert).not.toHaveBeenCalled();
	});

	it("allows creation one below the monitor limit", async () => {
		const monitor = {
			id: "monitor-1",
			projectId: null,
			name: "Website",
			url: "https://example.com/",
			enabled: true,
			createdAt: new Date("2026-01-01T00:00:00Z"),
		};

		createTransaction({
			insertResult: [monitor],
			selectResults: [[{ total: 49 }]],
		});

		const response = await POST(
			postRequest(
				JSON.stringify({ name: "Website", url: "https://example.com" }),
			),
		);

		expect(response.status).toBe(201);
		expect(insert).toHaveBeenCalledOnce();
	});

	it("rate limits by user id", async () => {
		await POST(
			postRequest(
				JSON.stringify({ name: "Website", url: "https://example.com" }),
			),
		);

		expect(checkRateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ name: "write" }),
			session.user.id,
		);
	});

	it("returns 429 with Retry-After and never reaches the database when limited", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 9 });

		const response = await POST(
			postRequest(
				JSON.stringify({ name: "Website", url: "https://example.com" }),
			),
		);

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("9");
		expect(transaction).not.toHaveBeenCalled();
		expect(insert).not.toHaveBeenCalled();
	});

	it("does not consult the limiter for unauthenticated requests", async () => {
		getSession.mockResolvedValue(null);

		const response = await POST(
			postRequest(
				JSON.stringify({ name: "Website", url: "https://example.com" }),
			),
		);

		expect(response.status).toBe(401);
		expect(checkRateLimit).not.toHaveBeenCalled();
	});
});
