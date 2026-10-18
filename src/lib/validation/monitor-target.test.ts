import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("node:dns/promises", () => ({
	lookup: vi.fn(),
}));

import { lookup } from "node:dns/promises";
import { validateMonitorTarget } from "./monitor-target";

const mockedLookup = vi.mocked(lookup);

type MockAddress = {
	address: string;
	family: 4 | 6;
};

function mockLookupResults(addresses: MockAddress[]) {
	mockedLookup.mockImplementation(
		() => Promise.resolve(addresses) as unknown as ReturnType<typeof lookup>,
	);
}

describe("validateMonitorTarget", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("accepts a hostname that resolves to a public IP address", async () => {
		mockLookupResults([{ address: "93.184.216.34", family: 4 }]);

		const result = await validateMonitorTarget("https://example.com/health");

		expect(result).toMatchObject({
			valid: true,
			hostname: "example.com",
			addresses: [{ address: "93.184.216.34", family: 4 }],
		});
	});

	it("rejects a hostname that resolves to a private IP address", async () => {
		mockLookupResults([{ address: "192.168.1.10", family: 4 }]);

		const result = await validateMonitorTarget("https://example.com");

		expect(result).toMatchObject({ valid: false });
	});

	it("rejects a hostname with a mix of public and private IP addresses", async () => {
		mockLookupResults([
			{ address: "93.184.216.34", family: 4 },
			{ address: "10.0.0.5", family: 4 },
		]);

		const result = await validateMonitorTarget("https://example.com");

		expect(result).toMatchObject({ valid: false });
	});

	it("rejects local hostnames without performing DNS lookup", async () => {
		const result = await validateMonitorTarget("http://localhost");

		expect(result).toMatchObject({ valid: false });
		expect(mockedLookup).not.toHaveBeenCalled();
	});

	it("rejects unsupported protocols", async () => {
		const result = await validateMonitorTarget("ftp://example.com");

		expect(result).toMatchObject({ valid: false });
		expect(mockedLookup).not.toHaveBeenCalled();
	});

	it("rejects invalid URLs", async () => {
		const result = await validateMonitorTarget("not-a-url");

		expect(result).toMatchObject({ valid: false });
		expect(mockedLookup).not.toHaveBeenCalled();
	});

	it("rejects hostnames that cannot be resolved", async () => {
		mockedLookup.mockRejectedValue(new Error("DNS lookup failed"));

		const result = await validateMonitorTarget("https://example.com");

		expect(result).toEqual({
			valid: false,
			error: "Unable to resolve hostname",
		});
	});

	it("rejects IPv4-mapped IPv6 addresses that represent private or loopback IPs", async () => {
		for (const address of ["::ffff:127.0.0.1", "::ffff:192.168.1.10"]) {
			mockLookupResults([{ address, family: 6 }]);

			const result = await validateMonitorTarget("https://example.com");

			expect(result, address).toMatchObject({ valid: false });
		}
	});

	it("rejects URLs containing credentials without performing DNS lookup", async () => {
		const result = await validateMonitorTarget(
			"https://user:password@example.com",
		);

		expect(result).toMatchObject({ valid: false });
		expect(mockedLookup).not.toHaveBeenCalled();
	});

	it("rejects documentation and benchmarking IP ranges", async () => {
		for (const address of [
			"192.0.2.10",
			"198.51.100.10",
			"203.0.113.10",
			"198.18.0.1",
			"2001:db8::1",
		]) {
			mockLookupResults([
				{
					address,
					family: address.includes(":") ? 6 : 4,
				},
			]);

			const result = await validateMonitorTarget("https://example.com");

			expect(result, address).toMatchObject({ valid: false });
		}
	});
});
