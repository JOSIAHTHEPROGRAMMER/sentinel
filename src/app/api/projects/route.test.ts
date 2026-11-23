import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, transaction, execute, insert, select, checkRateLimit } =
	vi.hoisted(() => ({
		getSession: vi.fn(),
		transaction: vi.fn(),
		execute: vi.fn(),
		insert: vi.fn(),
		select: vi.fn(),
		checkRateLimit: vi.fn(),
	}));

vi.mock("server-only", () => ({}));
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

function queryBuilder(result: unknown) {
	const promise = Promise.resolve(result);

	const methods = {
		from: vi.fn(),
		innerJoin: vi.fn(),
		leftJoin: vi.fn(),
		where: vi.fn(),
		groupBy: vi.fn(),
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
		methods.innerJoin,
		methods.leftJoin,
		methods.where,
		methods.groupBy,
		methods.orderBy,
		methods.limit,
	]) {
		method.mockImplementation(() => builder);
	}

	return builder;
}

function createTransaction(
	options: { insertResult?: unknown; selectResults?: unknown[] } = {},
) {
	const insertBuilder = queryBuilder(options.insertResult ?? []);

	// The list makes two selects: the project aggregate, then open incidents
	const selectQueue = [...(options.selectResults ?? [[], []])];

	select.mockReset();
	select.mockImplementation(() => queryBuilder(selectQueue.shift() ?? []));

	insert.mockReset();
	insert.mockReturnValue({
		values: vi.fn(() => insertBuilder),
	});

	const tx = {
		execute,
		insert,
		select,
	};

	transaction.mockImplementation(async (callback) => callback(tx));
}

function postRequest(body: string, headers: Record<string, string> = {}) {
	return new Request("http://localhost/api/projects", {
		method: "POST",
		headers,
		body,
	});
}

async function json(response: Response) {
	return response.json();
}

const projectRow = {
	id: "project-1",
	name: "Website",
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
	monitorCount: 2,
	enabledCount: 1,
	totalChecks: 100,
	successfulChecks: 95,
	averageResponseTime: 150,
};

describe("GET /api/projects", () => {
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

	it("returns an empty list when the user has no projects", async () => {
		const response = await GET();

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ projects: [] });
	});

	it("returns projects with counts, open incidents and health", async () => {
		createTransaction({
			selectResults: [[projectRow], [{ projectId: "project-1", open: 2 }]],
		});

		const response = await GET();

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({
			projects: [
				{
					id: "project-1",
					name: "Website",
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
					monitorCount: 2,
					enabledCount: 1,
					disabledCount: 1,
					openIncidents: 2,
					health: {
						totalChecks: 100,
						successfulChecks: 95,
						uptimePercentage: 95,
						averageResponseTime: 150,
					},
				},
			],
		});

		expect(execute).toHaveBeenCalledOnce();
		expect(select).toHaveBeenCalledTimes(2);
	});

	it("reports zero open incidents for a project without any", async () => {
		createTransaction({ selectResults: [[projectRow], []] });

		const response = await GET();
		const { projects } = await json(response);

		expect(projects[0].openIncidents).toBe(0);
	});

	it("keeps open incidents separate per project", async () => {
		createTransaction({
			selectResults: [
				[projectRow, { ...projectRow, id: "project-2", name: "API" }],
				[{ projectId: "project-2", open: 1 }],
			],
		});

		const response = await GET();
		const { projects } = await json(response);

		expect(projects[0].openIncidents).toBe(0);
		expect(projects[1].openIncidents).toBe(1);
	});

	it("returns null uptime and response time when there are no checks", async () => {
		createTransaction({
			selectResults: [
				[
					{
						...projectRow,
						monitorCount: 0,
						enabledCount: 0,
						totalChecks: 0,
						successfulChecks: 0,
						averageResponseTime: null,
					},
				],
				[],
			],
		});

		const response = await GET();
		const { projects } = await json(response);

		expect(projects[0].health).toEqual({
			totalChecks: 0,
			successfulChecks: 0,
			uptimePercentage: null,
			averageResponseTime: null,
		});
		expect(projects[0].disabledCount).toBe(0);
	});

	it("floors uptime so near-perfect projects are not shown as 100", async () => {
		createTransaction({
			selectResults: [
				[{ ...projectRow, totalChecks: 3, successfulChecks: 2 }],
				[],
			],
		});

		const response = await GET();
		const { projects } = await json(response);

		expect(projects[0].health.uptimePercentage).toBe(66.66);
	});
});

describe("POST /api/projects", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getSession.mockResolvedValue(session);
		checkRateLimit.mockResolvedValue({ allowed: true });
		createTransaction();
	});

	it("returns 401 when the user is not authenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await POST(
			postRequest(JSON.stringify({ name: "Website" })),
		);

		expect(response.status).toBe(401);
	});

	it("rejects invalid JSON", async () => {
		const response = await POST(postRequest("{invalid"));

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({ error: "Invalid JSON body" });
	});

	it("rejects a missing project name", async () => {
		const response = await POST(postRequest(JSON.stringify({})));

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({
			error: "A project name is required",
		});
	});

	it("rejects an empty project name", async () => {
		const response = await POST(postRequest(JSON.stringify({ name: "   " })));

		expect(response.status).toBe(400);
	});

	it("rejects a project name longer than 100 characters", async () => {
		const response = await POST(
			postRequest(JSON.stringify({ name: "A".repeat(101) })),
		);

		expect(response.status).toBe(400);
	});

	it("rejects unsupported fields such as an owner id", async () => {
		const response = await POST(
			postRequest(JSON.stringify({ name: "Website", ownerId: "another-user" })),
		);

		expect(response.status).toBe(400);
		expect(transaction).not.toHaveBeenCalled();
		expect(insert).not.toHaveBeenCalled();
	});

	it("rejects an oversized body", async () => {
		const response = await POST(
			postRequest(JSON.stringify({ name: "a".repeat(3_000) })),
		);

		expect(response.status).toBe(413);
		expect(transaction).not.toHaveBeenCalled();
	});

	it("rejects a body whose declared length is too large", async () => {
		const response = await POST(
			postRequest(JSON.stringify({ name: "Website" }), {
				"content-length": "100000",
			}),
		);

		expect(response.status).toBe(413);
		expect(transaction).not.toHaveBeenCalled();
	});

	it("creates a Project and returns 201", async () => {
		const project = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			name: "Website",
			createdAt: new Date("2026-01-01T00:00:00Z"),
			updatedAt: new Date("2026-01-01T00:00:00Z"),
		};

		createTransaction({ insertResult: [project] });

		const response = await POST(
			postRequest(JSON.stringify({ name: " Website " })),
		);

		expect(response.status).toBe(201);
		expect(await json(response)).toEqual({
			project: {
				...project,
				createdAt: project.createdAt.toISOString(),
				updatedAt: project.updatedAt.toISOString(),
			},
		});

		expect(execute).toHaveBeenCalledOnce();
		expect(insert).toHaveBeenCalledOnce();
	});

	it("rate limits by user id", async () => {
		await POST(postRequest(JSON.stringify({ name: "Website" })));

		expect(checkRateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ name: "write" }),
			session.user.id,
		);
	});

	it("returns 429 with Retry-After and never reaches the database when limited", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 6 });

		const response = await POST(
			postRequest(JSON.stringify({ name: "Website" })),
		);

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("6");
		expect(transaction).not.toHaveBeenCalled();
		expect(insert).not.toHaveBeenCalled();
	});

	it("does not consult the limiter for unauthenticated requests", async () => {
		getSession.mockResolvedValue(null);

		const response = await POST(
			postRequest(JSON.stringify({ name: "Website" })),
		);

		expect(response.status).toBe(401);
		expect(checkRateLimit).not.toHaveBeenCalled();
	});
});
