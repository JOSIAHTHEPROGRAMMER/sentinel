import { describe, expect, it } from "vitest";
import { assertWebEnv, validateWebEnv } from "./env";

const validSecret = "a".repeat(40);

const devEnv = {
	NODE_ENV: "development",
	DATABASE_URL: "postgresql://app@host/db",
	BETTER_AUTH_SECRET: "short-dev-secret",
	BETTER_AUTH_URL: "http://localhost:3000",
};

const productionEnv = {
	NODE_ENV: "production",
	DATABASE_URL: "postgresql://app@host/db",
	BETTER_AUTH_SECRET: validSecret,
	BETTER_AUTH_URL: "https://sentinel.example.com",
	UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
	UPSTASH_REDIS_REST_TOKEN: "token",
};

describe("validateWebEnv", () => {
	it("accepts a complete development environment without Upstash", () => {
		expect(validateWebEnv(devEnv)).toEqual([]);
	});

	it("accepts a complete production environment", () => {
		expect(validateWebEnv(productionEnv)).toEqual([]);
	});

	it("reports each missing core variable by name", () => {
		const problems = validateWebEnv({ NODE_ENV: "development" });

		expect(problems).toEqual([
			"DATABASE_URL is not set",
			"BETTER_AUTH_SECRET is not set",
			"BETTER_AUTH_URL is not set",
		]);
	});

	it("treats blank values as missing", () => {
		const problems = validateWebEnv({ ...devEnv, DATABASE_URL: "   " });

		expect(problems).toEqual(["DATABASE_URL is not set"]);
	});

	it("requires Upstash variables in production", () => {
		const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ...rest } =
			productionEnv;

		expect(validateWebEnv(rest)).toEqual([
			"UPSTASH_REDIS_REST_URL is not set",
			"UPSTASH_REDIS_REST_TOKEN is not set",
		]);
	});

	it("rejects a short secret in production", () => {
		const problems = validateWebEnv({
			...productionEnv,
			BETTER_AUTH_SECRET: "too-short",
		});

		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("at least 32 characters");
	});

	it("rejects the placeholder secret from .env.example in production", () => {
		const problems = validateWebEnv({
			...productionEnv,
			BETTER_AUTH_SECRET: "replace-with-a-random-secret-replace-with-a-random",
		});

		expect(problems).toEqual([
			"BETTER_AUTH_SECRET looks like a placeholder value",
		]);
	});

	it("does not enforce secret strength outside production", () => {
		expect(validateWebEnv({ ...devEnv, BETTER_AUTH_SECRET: "x" })).toEqual([]);
	});

	it("never includes variable values in the messages", () => {
		const problems = validateWebEnv({
			...productionEnv,
			BETTER_AUTH_SECRET: "short-secret-value",
		});

		expect(problems.join(" ")).not.toContain("short-secret-value");
	});
});

describe("assertWebEnv", () => {
	it("does not throw for a valid environment", () => {
		expect(() => assertWebEnv(productionEnv)).not.toThrow();
	});

	it("throws one error listing every problem", () => {
		expect(() => assertWebEnv({ NODE_ENV: "development" })).toThrow(
			/DATABASE_URL is not set[\s\S]*BETTER_AUTH_SECRET is not set[\s\S]*BETTER_AUTH_URL is not set/,
		);
	});
});
