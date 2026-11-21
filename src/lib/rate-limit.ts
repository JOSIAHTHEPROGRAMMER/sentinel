import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

type Window = Parameters<typeof Ratelimit.slidingWindow>[1];

type RateLimitPolicy = {
	name: string;
	requests: number;
	window: Window;
};

export const WRITE_POLICY: RateLimitPolicy = {
	name: "write",
	requests: 30,
	window: "1 m",
};

const limiters = new Map<string, Ratelimit>();
let warnedAboutConfig = false;

function getLimiter(policy: RateLimitPolicy): Ratelimit | null {
	const existing = limiters.get(policy.name);

	if (existing) {
		return existing;
	}

	if (
		!process.env.UPSTASH_REDIS_REST_URL ||
		!process.env.UPSTASH_REDIS_REST_TOKEN
	) {
		if (!warnedAboutConfig) {
			warnedAboutConfig = true;
			console.warn("Rate limiting is disabled: Upstash is not configured");
		}

		return null;
	}

	const limiter = new Ratelimit({
		redis: Redis.fromEnv(),
		limiter: Ratelimit.slidingWindow(policy.requests, policy.window),
		prefix: `sentinel:${policy.name}`,
	});

	limiters.set(policy.name, limiter);

	return limiter;
}

export async function checkRateLimit(
	policy: RateLimitPolicy,
	identifier: string,
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
	const limiter = getLimiter(policy);

	if (!limiter) {
		return { allowed: true };
	}

	try {
		const result = await limiter.limit(identifier);

		if (result.success) {
			return { allowed: true };
		}

		return {
			allowed: false,
			retryAfterSeconds: Math.max(
				1,
				Math.ceil((result.reset - Date.now()) / 1000),
			),
		};
	} catch (error) {
		// Fail open: an unreachable limiter must not lock users out of the app
		console.error("Rate limit check failed:", error);
		return { allowed: true };
	}
}

export function rateLimitResponse(retryAfterSeconds: number) {
	return NextResponse.json(
		{ error: "Too many requests. Please try again shortly." },
		{ status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
	);
}
