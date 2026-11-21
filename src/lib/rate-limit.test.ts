import { beforeEach, describe, expect, it, vi } from "vitest";

const { limit, slidingWindow, fromEnv } = vi.hoisted(() => ({
	limit: vi.fn(),
	slidingWindow: vi.fn(() => "sliding-window-config"),
	fromEnv: vi.fn(() => "redis-client"),
}));

vi.mock("@upstash/ratelimit", () => {
	class Ratelimit {
		static slidingWindow = slidingWindow;
		limit = limit;
	}

	return { Ratelimit };
});

vi.mock("@upstash/redis", () => ({ Redis: { fromEnv } }));

const policy = { name: "write", requests: 30, window: "1 m" } as const;

async function loadModule() {
	vi.resetModules();
	return import("./rate-limit");
}

describe("checkRateLimit", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("allows requests without calling Upstash when it is not configured", async () => {
		vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
		vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

		const { checkRateLimit } = await loadModule();

		expect(await checkRateLimit(policy, "user-1")).toEqual({ allowed: true });
		expect(limit).not.toHaveBeenCalled();
	});

	it("warns only once when Upstash is not configured", async () => {
		vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
		vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

		const { checkRateLimit } = await loadModule();

		await checkRateLimit(policy, "user-1");
		await checkRateLimit(policy, "user-1");

		expect(console.warn).toHaveBeenCalledOnce();
	});

	describe("when configured", () => {
		beforeEach(() => {
			vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
			vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
		});

		it("allows a request under the limit", async () => {
			limit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });

			const { checkRateLimit } = await loadModule();

			expect(await checkRateLimit(policy, "user-1")).toEqual({ allowed: true });
			expect(limit).toHaveBeenCalledWith("user-1");
		});

		it("blocks a request over the limit and reports when to retry", async () => {
			limit.mockResolvedValue({ success: false, reset: Date.now() + 12_500 });

			const { checkRateLimit } = await loadModule();
			const result = await checkRateLimit(policy, "user-1");

			expect(result.allowed).toBe(false);

			if (!result.allowed) {
				expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(12);
				expect(result.retryAfterSeconds).toBeLessThanOrEqual(13);
			}
		});

		it("never reports a retry time below one second", async () => {
			limit.mockResolvedValue({ success: false, reset: Date.now() - 5_000 });

			const { checkRateLimit } = await loadModule();
			const result = await checkRateLimit(policy, "user-1");

			expect(result).toEqual({ allowed: false, retryAfterSeconds: 1 });
		});

		it("fails open when Upstash errors", async () => {
			limit.mockRejectedValue(new Error("Redis unreachable"));

			const { checkRateLimit } = await loadModule();

			expect(await checkRateLimit(policy, "user-1")).toEqual({ allowed: true });
			expect(console.error).toHaveBeenCalled();
		});

		it("creates one limiter per policy and reuses it", async () => {
			limit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });

			const { checkRateLimit } = await loadModule();

			await checkRateLimit(policy, "user-1");
			await checkRateLimit(policy, "user-2");

			expect(slidingWindow).toHaveBeenCalledOnce();
			expect(slidingWindow).toHaveBeenCalledWith(30, "1 m");
		});
	});
});

describe("rateLimitResponse", () => {
	it("returns a 429 with a Retry-After header", async () => {
		const { rateLimitResponse } = await loadModule();

		const response = rateLimitResponse(7);

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("7");
		expect(await response.json()).toEqual({
			error: "Too many requests. Please try again shortly.",
		});
	});
});
