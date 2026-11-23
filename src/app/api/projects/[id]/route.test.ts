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

vi.mock("server-only", () => ({}));
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

const monitorRow = {
	id: "32bc70f6-c55f-4034-8bd7-f45bc84abab0",
	name: "Website",
	url: "https://example.com/",
	enabled: true,
	intervalSeconds: 300,
	timeoutMs: 10000,
	createdAt: new Date("2026-01-02T00:00:00Z"),
	updatedAt: new Date("2026-01-02T00:00:00Z"),
	openIncidentStartedAt: null,
	openIncidentReason: null,
};

const expectedMonitor = {
	id: monitorRow.id,
	name: "Website",
	url: "https://example.com/",
	enabled: true,
	intervalSeconds: 300,
	timeoutMs: 10000,
	createdAt: "2026-01-02T00:00:00.000Z",
	updatedAt: "2026-01-02T00:00:00.000Z",
	openIncident: null,
};

const emptyHealth = {
	totalChecks: 0,
	successfulChecks: 0,
	uptimePercentage: null,
	averageResponseTime: null,
};

const expectedProject = {
	...project,
	createdAt: project.createdAt.toISOString(),
	updatedAt: project.updatedAt.toISOString(),
};

function queryBuilder(result: unknown) {
	const promise = Promise.resolve(result);

	const methods = {
		from: vi.fn(),
		innerJoin: vi.fn(),
		leftJoin: vi.fn(),
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
		methods.leftJoin,
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

function makeRequest(
	body: string,
	method: string,
	headers: Record<string, string> = {},
) {
	return new Request(`http://localhost/api/projects/${projectId}`, {
		method,
		headers: { "Content-Type": "application/json", ...headers },
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

	it("returns the project, its monitors and counts", async () => {
		createTransaction({
			projectResult: [project],
			monitorsResult: [monitorRow],
		});

		const response = await GET(new Request("http://localhost"), context);

		expect(response.status).toBe(200);
		expect(await json(response)).toEqual({
			project: expectedProject,
			monitors: [expectedMonitor],
			counts: { monitors: 1, enabled: 1, disabled: 0, openIncidents: 0 },
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
			project: expectedProject,
			monitors: [],
			counts: { monitors: 0, enabled: 0, disabled: 0, openIncidents: 0 },
			health: emptyHealth,
		});
	});

	it("flags monitors with an open incident and lists them first", async () => {
		const unhealthy = {
			...monitorRow,
			id: "11111111-1111-4111-8111-111111111111",
			name: "Payments",
			createdAt: new Date("2026-01-03T00:00:00Z"),
			openIncidentStartedAt: new Date("2026-01-05T00:00:00Z"),
			openIncidentReason: "HTTP 503",
		};

		createTransaction({
			projectResult: [project],
			monitorsResult: [monitorRow, unhealthy],
		});

		const response = await GET(new Request("http://localhost"), context);
		const body = await json(response);

		expect(
			body.monitors.map((monitor: { name: string }) => monitor.name),
		).toEqual(["Payments", "Website"]);
		expect(body.monitors[0].openIncident).toEqual({
			startedAt: "2026-01-05T00:00:00.000Z",
			reason: "HTTP 503",
		});
		expect(body.monitors[1].openIncident).toBeNull();
		expect(body.counts.openIncidents).toBe(1);
	});

	it("counts enabled and disabled monitors", async () => {
		createTransaction({
			projectResult: [project],
			monitorsResult: [
				monitorRow,
				{
					...monitorRow,
					id: "22222222-2222-4222-8222-222222222222",
					enabled: false,
				},
			],
		});

		const response = await GET(new Request("http://localhost"), context);
		const body = await json(response);

		expect(body.counts).toEqual({
			monitors: 2,
			enabled: 1,
			disabled: 1,
			openIncidents: 0,
		});
	});

	it("computes floored uptime from successful checks", async () => {
		createTransaction({
			projectResult: [project],
			healthResult: [
				{ totalChecks: 3, successfulChecks: 2, averageResponseTime: 120 },
			],
		});

		const response = await GET(new Request("http://localhost"), context);
		const body = await json(response);

		expect(body.health).toEqual({
			totalChecks: 3,
			successfulChecks: 2,
			uptimePercentage: 66.66,
			averageResponseTime: 120,
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

	it("rejects an oversized body", async () => {
		const response = await PATCH(
			makeRequest(JSON.stringify({ name: "a".repeat(3_000) }), "PATCH"),
			context,
		);

		expect(response.status).toBe(413);
		expect(transaction).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
	});

	it("rejects a body whose declared length is too large", async () => {
		const response = await PATCH(
			makeRequest(JSON.stringify({ name: "Updated" }), "PATCH", {
				"content-length": "100000",
			}),
			context,
		);

		expect(response.status).toBe(413);
		expect(transaction).not.toHaveBeenCalled();
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

	it("does not consult the limiter for unauthenticated PATCH requests", async () => {
		getSession.mockResolvedValue(null);

		await PATCH(
			makeRequest(JSON.stringify({ name: "Updated Website" }), "PATCH"),
			context,
		);

		expect(checkRateLimit).not.toHaveBeenCalled();
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
