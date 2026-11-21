import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getSession,
	transaction,
	execute,
	select,
	update,
	deleteMock,
	checkRateLimit,
} = vi.hoisted(() => ({
	getSession: vi.fn(),
	transaction: vi.fn(),
	execute: vi.fn(),
	select: vi.fn(),
	update: vi.fn(),
	deleteMock: vi.fn(),
	checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/db", () => ({ db: { transaction } }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/rate-limit")>()),
	checkRateLimit,
}));

import { DELETE, GET, PATCH } from "./route";

const projectId = "550e8400-e29b-41d4-a716-446655440000";

const session = {
	user: { id: "user-123" },
};

const project = {
	id: projectId,
	name: "Personal Website",
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const monitor = {
	id: "32bc70f6-c55f-4034-8bd7-f45bc84abab0",
	name: "Website",
	url: "https://example.com/",
	enabled: true,
	intervalSeconds: 300,
	timeoutMs: 10000,
	createdAt: new Date("2026-01-02T00:00:00Z"),
	updatedAt: new Date("2026-01-02T00:00:00Z"),
};

const emptyHealth = {
	totalChecks: 0,
	successfulChecks: 0,
	uptimePercentage: null,
	averageResponseTime: null,
};

function queryBuilder(result: unknown) {
	const promise = Promise.resolve(result);

	const methods = {
		from: vi.fn(),
		innerJoin: vi.fn(),
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
		methods.innerJoin,
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
		projectResult?: unknown;
		monitorsResult?: unknown;
		healthResult?: unknown;
		updateResult?: unknown;
		deleteResult?: unknown;
	} = {},
) {
	const projectBuilder = queryBuilder(options.projectResult ?? []);
	const monitorBuilder = queryBuilder(options.monitorsResult ?? []);
	const healthBuilder = queryBuilder(
		options.healthResult ?? [
			{
				totalChecks: 0,
				successfulChecks: 0,
				averageResponseTime: null,
			},
		],
	);
	const updateBuilder = queryBuilder(options.updateResult ?? []);
	const deleteBuilder = queryBuilder(options.deleteResult ?? []);

	select.mockReset();
	select
		.mockReturnValueOnce(projectBuilder)
		.mockReturnValueOnce(monitorBuilder)
		.mockReturnValueOnce(healthBuilder);

	update.mockReset();
	update.mockImplementation(() => ({
		set: vi.fn(() => updateBuilder),
	}));

	deleteMock.mockReset();
	deleteMock.mockReturnValue({
		where: vi.fn(() => deleteBuilder),
	});

	const tx = {
		execute,
		select,
		update,
		delete: deleteMock,
	};

	transaction.mockImplementation(async (callback) => callback(tx));
}

function makeRequest(body: string, method: string) {
	return new Request(`http://localhost/api/projects/${projectId}`, {
		method,
		headers: { "Content-Type": "application/json" },
		body,
	});
}

const context = {
	params: Promise.resolve({ id: projectId }),
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

describe("GET /api/projects/[id]", () => {
	it("returns 401 when unauthenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await GET(new Request("http://localhost"), context);

		expect(response.status).toBe(401);
		expect(transaction).not.toHaveBeenCalled();
	});

	it("rejects an invalid project ID", async () => {
		const response = await GET(new Request("http://localhost"), {
			params: Promise.resolve({ id: "invalid-id" }),
		});

		expect(response.status).toBe(400);
		expect(transaction).not.toHaveBeenCalled();
	});

	it("returns the project and its monitors", async () => {
		createTransaction({
			projectResult: [project],
			monitorsResult: [monitor],
		});

		const response = await GET(new Request("http://localhost"), context);

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({
			project: {
				...project,
				createdAt: project.createdAt.toISOString(),
				updatedAt: project.updatedAt.toISOString(),
			},
			monitors: [
				{
					...monitor,
					createdAt: monitor.createdAt.toISOString(),
					updatedAt: monitor.updatedAt.toISOString(),
				},
			],
			health: emptyHealth,
		});

		expect(execute).toHaveBeenCalledOnce();
		expect(select).toHaveBeenCalledTimes(3);
	});

	it("returns an empty monitor list when the project has no monitors", async () => {
		createTransaction({
			projectResult: [project],
			monitorsResult: [],
		});

		const response = await GET(new Request("http://localhost"), context);

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({
			project: {
				...project,
				createdAt: project.createdAt.toISOString(),
				updatedAt: project.updatedAt.toISOString(),
			},
			monitors: [],
			health: emptyHealth,
		});
	});

	it("returns 404 when the project is not found", async () => {
		const response = await GET(new Request("http://localhost"), context);

		expect(response.status).toBe(404);
		expect(await json(response)).toEqual({
			error: "Project not found",
		});

		expect(select).toHaveBeenCalledOnce();
	});
});

describe("PATCH /api/projects/[id]", () => {
	it("returns 401 when unauthenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await PATCH(
			makeRequest(JSON.stringify({ name: "Updated Website" }), "PATCH"),
			context,
		);

		expect(response.status).toBe(401);
		expect(transaction).not.toHaveBeenCalled();
	});

	it("rejects an invalid project ID", async () => {
		const response = await PATCH(
			makeRequest(JSON.stringify({ name: "Updated Website" }), "PATCH"),
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
			makeRequest(
				JSON.stringify({ name: "Updated Website", ownerId: "another-user" }),
				"PATCH",
			),
			context,
		);

		expect(response.status).toBe(400);
		expect(update).not.toHaveBeenCalled();
	});

	it("rejects an empty project name", async () => {
		const response = await PATCH(
			makeRequest(JSON.stringify({ name: "   " }), "PATCH"),
			context,
		);

		expect(response.status).toBe(400);
		expect(update).not.toHaveBeenCalled();
	});

	it("rejects a project name longer than 100 characters", async () => {
		const response = await PATCH(
			makeRequest(JSON.stringify({ name: "a".repeat(101) }), "PATCH"),
			context,
		);

		expect(response.status).toBe(400);
		expect(update).not.toHaveBeenCalled();
	});

	it("updates a project and returns it", async () => {
		const updatedProject = {
			...project,
			name: "Updated Website",
		};

		createTransaction({
			updateResult: [updatedProject],
		});

		const response = await PATCH(
			makeRequest(JSON.stringify({ name: " Updated Website " }), "PATCH"),
			context,
		);

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({
			project: {
				...updatedProject,
				createdAt: updatedProject.createdAt.toISOString(),
				updatedAt: updatedProject.updatedAt.toISOString(),
			},
		});

		expect(execute).toHaveBeenCalledOnce();
		expect(update).toHaveBeenCalledOnce();
	});

	it("returns 404 when the project cannot be updated", async () => {
		const response = await PATCH(
			makeRequest(JSON.stringify({ name: "Updated Website" }), "PATCH"),
			context,
		);

		expect(response.status).toBe(404);
	});

	it("returns 429 on PATCH and never reaches the database when rate limited", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 4 });

		const response = await PATCH(
			makeRequest(JSON.stringify({ name: "Updated Website" }), "PATCH"),
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

describe("DELETE /api/projects/[id]", () => {
	it("returns 401 when unauthenticated", async () => {
		getSession.mockResolvedValue(null);

		const response = await DELETE(new Request("http://localhost"), context);

		expect(response.status).toBe(401);
		expect(transaction).not.toHaveBeenCalled();
	});

	it("rejects an invalid project ID", async () => {
		const response = await DELETE(new Request("http://localhost"), {
			params: Promise.resolve({ id: "invalid-id" }),
		});

		expect(response.status).toBe(400);
		expect(transaction).not.toHaveBeenCalled();
	});

	it("unassigns monitors and deletes the project", async () => {
		createTransaction({
			projectResult: [{ id: projectId }],
		});

		const response = await DELETE(new Request("http://localhost"), context);

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({ success: true });

		expect(execute).toHaveBeenCalledOnce();
		expect(select).toHaveBeenCalledOnce();
		expect(update).toHaveBeenCalledOnce();
		expect(deleteMock).toHaveBeenCalledOnce();
	});

	it("returns 404 when the project cannot be deleted", async () => {
		const response = await DELETE(new Request("http://localhost"), context);

		expect(response.status).toBe(404);
		expect(await json(response)).toEqual({
			error: "Project not found",
		});

		expect(update).not.toHaveBeenCalled();
		expect(deleteMock).not.toHaveBeenCalled();
	});

	it("returns 429 on DELETE and never reaches the database when rate limited", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 4 });

		const response = await DELETE(new Request("http://localhost"), context);

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("4");
		expect(transaction).not.toHaveBeenCalled();
		expect(deleteMock).not.toHaveBeenCalled();
	});
});
