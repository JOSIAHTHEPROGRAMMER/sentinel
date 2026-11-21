import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Rule = { window: number; max: number };

type ConsumeResult = { allowed: boolean; retryAfter: number | null };

const limiters = new Map<string, Ratelimit>();
let warnedAboutConfig = false;

function getLimiter(rule: Rule): Ratelimit | null {
	if (
		!process.env.UPSTASH_REDIS_REST_URL ||
		!process.env.UPSTASH_REDIS_REST_TOKEN
	) {
		if (!warnedAboutConfig) {
			warnedAboutConfig = true;
			console.warn("Auth rate limiting is disabled: Upstash is not configured");
		}

		return null;
	}

	// Better Auth sends a different rule per path, so each rule gets its own limiter
	const cacheKey = `${rule.max}:${rule.window}`;
	const existing = limiters.get(cacheKey);

	if (existing) {
		return existing;
	}

	const limiter = new Ratelimit({
		redis: Redis.fromEnv(),
		limiter: Ratelimit.slidingWindow(rule.max, `${rule.window} s` as const),
		prefix: `sentinel:auth:${cacheKey}`,
	});

	limiters.set(cacheKey, limiter);

	return limiter;
}

export const authRateLimitStorage = {
	async consume(key: string, rule: Rule): Promise<ConsumeResult> {
		const limiter = getLimiter(rule);

		if (!limiter) {
			return { allowed: true, retryAfter: null };
		}

		try {
			const result = await limiter.limit(key);

			if (result.success) {
				return { allowed: true, retryAfter: null };
			}

			return {
				allowed: false,
				retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
			};
		} catch (error) {
			// Fail open: an unreachable limiter must not lock users out of sign-in
			console.error("Auth rate limit check failed:", error);
			return { allowed: true, retryAfter: null };
		}
	},
};
