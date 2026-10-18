import { describe, expect, it } from "vitest";
import { validateMonitorUrl } from "./monitor-url";

describe("validateMonitorUrl", () => {
	it("accepts valid public HTTP and HTTPS URLs", () => {
		expect(validateMonitorUrl("https://example.com/health")).toEqual({
			valid: true,
			url: "https://example.com/health",
		});

		expect(validateMonitorUrl("http://example.com")).toEqual({
			valid: true,
			url: "http://example.com/",
		});
	});

	it("rejects empty or non-string values", () => {
		expect(validateMonitorUrl("")).toMatchObject({ valid: false });
		expect(validateMonitorUrl("   ")).toMatchObject({ valid: false });
		expect(validateMonitorUrl(null)).toMatchObject({ valid: false });
		expect(validateMonitorUrl(123)).toMatchObject({ valid: false });
	});

	it("rejects malformed URLs", () => {
		expect(validateMonitorUrl("not-a-url")).toMatchObject({
			valid: false,
			error: "Invalid URL",
		});
	});

	it("rejects unsupported protocols", () => {
		expect(validateMonitorUrl("ftp://example.com")).toMatchObject({
			valid: false,
			error: "URL is not allowed",
		});
	});

	it("rejects URLs containing credentials", () => {
		expect(
			validateMonitorUrl("https://user:password@example.com"),
		).toMatchObject({
			valid: false,
			error: "URL is not allowed",
		});
	});

	it("rejects localhost and local hostnames", () => {
		for (const url of [
			"http://localhost",
			"http://localhost:3000",
			"http://service.localhost",
			"http://printer.local",
			"http://database.internal",
		]) {
			expect(validateMonitorUrl(url), url).toMatchObject({ valid: false });
		}
	});

	it("rejects private and non-public IP addresses", () => {
		for (const url of [
			"http://127.0.0.1",
			"http://10.0.0.1",
			"http://172.16.0.1",
			"http://192.168.1.1",
			"http://169.254.169.254",
			"http://[::1]",
			"http://[fc00::1]",
			"http://[fe80::1]",
			"http://0.0.0.0",
			"http://255.255.255.255",
			"http://224.0.0.1",
			"http://[::ffff:127.0.0.1]",
		]) {
			expect(validateMonitorUrl(url), url).toMatchObject({ valid: false });
		}
	});

	it("rejects URLs exceeding the maximum length", () => {
		const url = `https://example.com/${"a".repeat(2048)}`;

		expect(validateMonitorUrl(url)).toEqual({
			valid: false,
			error: "URL is too long",
		});
	});

	it("normalizes accepted URLs", () => {
		expect(validateMonitorUrl("  HTTPS://EXAMPLE.COM  ")).toEqual({
			valid: true,
			url: "https://example.com/",
		});
	});
});
