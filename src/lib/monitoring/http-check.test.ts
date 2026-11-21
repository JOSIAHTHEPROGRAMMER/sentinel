// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../validation/monitor-target", () => ({
	validateMonitorTarget: vi.fn(async (value: string) => ({
		valid: true,
		hostname: new URL(value).hostname,
		addresses: [{ address: "127.0.0.1", family: 4 }],
	})),
}));

import { checkHttpTarget } from "./http-check";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	server = createServer((request, response) => {
		if (request.url === "/large") {
			response.writeHead(200, { "content-type": "text/plain" });
			response.end("x".repeat(200 * 1024));
			return;
		}

		if (request.url === "/error") {
			response.writeHead(503);
			response.end("unavailable");
			return;
		}

		if (request.url === "/redirect") {
			response.writeHead(302, { location: "/ok" });
			response.end();
			return;
		}

		if (request.url === "/slow") {
			setTimeout(() => {
				response.writeHead(200);
				response.end("late");
			}, 1_000);
			return;
		}

		response.writeHead(200);
		response.end("ok");
	});

	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});

	const { port } = server.address() as AddressInfo;
	baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => {
		server.close(() => resolve());
	});
});

describe("checkHttpTarget", () => {
	it("succeeds for a healthy endpoint", async () => {
		const result = await checkHttpTarget(`${baseUrl}/ok`, 2_000);

		expect(result.success).toBe(true);
		expect(result.statusCode).toBe(200);
	});

	it("does not fail a healthy endpoint with a large body", async () => {
		const result = await checkHttpTarget(`${baseUrl}/large`, 2_000);

		expect(result.success).toBe(true);
		expect(result.statusCode).toBe(200);
		expect(result.error).toBeUndefined();
	});

	it("fails on an error status code", async () => {
		const result = await checkHttpTarget(`${baseUrl}/error`, 2_000);

		expect(result.success).toBe(false);
		expect(result.statusCode).toBe(503);
	});

	it("follows redirects and reports the final URL", async () => {
		const result = await checkHttpTarget(`${baseUrl}/redirect`, 2_000);

		expect(result.success).toBe(true);
		expect(result.finalUrl.endsWith("/ok")).toBe(true);
	});

	it("reports a timeout using the monitor's configured limit", async () => {
		const result = await checkHttpTarget(`${baseUrl}/slow`, 200);

		expect(result.success).toBe(false);
		expect(result.error).toBe("Request timed out");
	});
});
