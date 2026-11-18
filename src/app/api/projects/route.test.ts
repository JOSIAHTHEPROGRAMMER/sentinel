import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, transaction, execute, insert, select } = vi.hoisted(() => ({
	getSession: vi.fn(),
	transaction: vi.fn(),
	execute: vi.fn(),
	insert: vi.fn(),
	select: vi.fn(),
}));

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
		leftJoin: vi.fn(),
		groupBy: vi.fn(),
		orderBy: vi.fn(),
		returning: vi.fn(() => Promise.resolve(result)),
	};

	for (const method of [
		methods.from,
		methods.leftJoin,
		methods.groupBy,
		methods.orderBy,
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

	insert.mockReturnValue({
		values: vi.fn(() => insertBuilder),
	});

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

describe("GET /api/projects", () => {
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

	it("returns the authenticated user's Projects with health summaries", async () => {
		const projects = [
			{
				id: "project-1",
				name: "Website",
				createdAt: new Date("2026-01-01T00:00:00Z"),
				updatedAt: new Date("2026-01-01T00:00:00Z"),
				monitorCount: 2,
				totalChecks: 100,
				successfulChecks: 95,
				averageResponseTime: 150,
			},
		];

		createTransaction({ selectResult: projects });

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
		expect(select).toHaveBeenCalledOnce();
	});
});

describe("POST /api/projects", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getSession.mockResolvedValue(session);
		createTransaction();
	});

	it("returns 401 when the user is not authenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await POST(
			new Request("http://localhost/api/projects", {
				method: "POST",
				body: JSON.stringify({ name: "Website" }),
			}),
		);

		expect(response.status).toBe(401);
	});

	it("rejects invalid JSON", async () => {
		const response = await POST(
			new Request("http://localhost/api/projects", {
				method: "POST",
				body: "{invalid",
			}),
		);

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({ error: "Invalid JSON body" });
	});

	it("rejects a missing project name", async () => {
		const response = await POST(
			new Request("http://localhost/api/projects", {
				method: "POST",
				body: JSON.stringify({}),
			}),
		);

		expect(response.status).toBe(400);
		expect(await json(response)).toEqual({
			error: "A project name is required",
		});
	});

	it("rejects an empty project name", async () => {
		const response = await POST(
			new Request("http://localhost/api/projects", {
				method: "POST",
				body: JSON.stringify({ name: "   " }),
			}),
		);

		expect(response.status).toBe(400);
	});

	it("rejects a project name longer than 100 characters", async () => {
		const response = await POST(
			new Request("http://localhost/api/projects", {
				method: "POST",
				body: JSON.stringify({ name: "A".repeat(101) }),
			}),
		);

		expect(response.status).toBe(400);
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
			new Request("http://localhost/api/projects", {
				method: "POST",
				body: JSON.stringify({ name: " Website " }),
			}),
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
});
