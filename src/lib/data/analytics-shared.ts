export const ANALYTICS_RANGES = ["24h", "7d", "30d"] as const;

export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = "24h";

export type AnalyticsSummary = {
	range: AnalyticsRange;
	totalChecks: number;
	successfulChecks: number;
	failedChecks: number;
	uptimePercentage: number | null;
	averageResponseTimeMs: number | null;
	openIncidents: number;
	incidentsStarted: number;
	incidentsResolved: number;
};

export type TimeWindow = {
	startMs: number;
	endMs: number;
};

export type CustomWindowResult =
	| { valid: true; window: TimeWindow }
	| { valid: false; error: string };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const MIN_CUSTOM_WINDOW_MS = HOUR_MS;
export const MAX_CUSTOM_WINDOW_MS = 90 * DAY_MS;

export const SLOW_MULTIPLIER = 2;
export const SLOW_FLOOR_MS = 500;
export const SLOW_MIN_SAMPLES = 5;

const RANGE_MS: Record<AnalyticsRange, number> = {
	"24h": DAY_MS,
	"7d": 7 * DAY_MS,
	"30d": 30 * DAY_MS,
};

const BUCKET_SECONDS: Record<AnalyticsRange, number> = {
	"24h": 60 * 60,
	"7d": 6 * 60 * 60,
	"30d": 24 * 60 * 60,
};

export function parseAnalyticsRange(
	value: string | string[] | undefined,
): AnalyticsRange {
	if (typeof value !== "string") {
		return DEFAULT_ANALYTICS_RANGE;
	}

	return (
		ANALYTICS_RANGES.find((range) => range === value) ?? DEFAULT_ANALYTICS_RANGE
	);
}

export function rangeToMs(range: AnalyticsRange): number {
	return RANGE_MS[range];
}

export function bucketSecondsForRange(range: AnalyticsRange): number {
	return BUCKET_SECONDS[range];
}

export function bucketSecondsForSpan(spanMs: number): number {
	if (spanMs <= 2 * DAY_MS) {
		return 60 * 60;
	}

	if (spanMs <= 10 * DAY_MS) {
		return 6 * 60 * 60;
	}

	return 24 * 60 * 60;
}

export function windowForRange(range: AnalyticsRange, now: number): TimeWindow {
	return { startMs: now - RANGE_MS[range], endMs: now };
}

export function parseCustomWindow(
	from: string | string[] | undefined,
	to: string | string[] | undefined,
	now: number,
): CustomWindowResult {
	if (typeof from !== "string" || typeof to !== "string") {
		return { valid: false, error: "Both a start and an end are required" };
	}

	const startMs = Date.parse(from);
	const requestedEndMs = Date.parse(to);

	if (Number.isNaN(startMs) || Number.isNaN(requestedEndMs)) {
		return { valid: false, error: "The dates are not valid" };
	}

	const endMs = Math.min(requestedEndMs, now);

	if (startMs >= endMs) {
		return { valid: false, error: "The start must be before the end" };
	}

	const span = endMs - startMs;

	if (span < MIN_CUSTOM_WINDOW_MS) {
		return { valid: false, error: "The period must be at least 1 hour" };
	}

	if (span > MAX_CUSTOM_WINDOW_MS) {
		return { valid: false, error: "The period can be at most 90 days" };
	}

	return { valid: true, window: { startMs, endMs } };
}

export function buildBucketStartsForWindow(
	window: TimeWindow,
	bucketSeconds: number,
): number[] {
	const bucketMs = bucketSeconds * 1000;
	const firstStart = Math.floor(window.startMs / bucketMs) * bucketMs;
	const lastStart = Math.floor(window.endMs / bucketMs) * bucketMs;
	const count = (lastStart - firstStart) / bucketMs + 1;

	return Array.from(
		{ length: count },
		(_, index) => firstStart + index * bucketMs,
	);
}

export function buildBucketStarts(
	range: AnalyticsRange,
	now: number,
): number[] {
	return buildBucketStartsForWindow(
		windowForRange(range, now),
		BUCKET_SECONDS[range],
	);
}

export function calculateUptimePercentage(
	successfulChecks: number,
	totalChecks: number,
): number | null {
	if (totalChecks <= 0) {
		return null;
	}

	return Math.floor((successfulChecks * 10000) / totalChecks) / 100;
}

export function flagSlowValues(values: (number | null)[]): boolean[] {
	const present = values
		.filter((value): value is number => value !== null)
		.sort((a, b) => a - b);

	if (present.length < SLOW_MIN_SAMPLES) {
		return values.map(() => false);
	}

	const middle = Math.floor(present.length / 2);
	const median =
		present.length % 2 === 0
			? ((present[middle - 1] ?? 0) + (present[middle] ?? 0)) / 2
			: (present[middle] ?? 0);

	const threshold = Math.max(median * SLOW_MULTIPLIER, SLOW_FLOOR_MS);

	return values.map((value) => value !== null && value > threshold);
}
