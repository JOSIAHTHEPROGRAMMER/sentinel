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

const RANGE_MS: Record<AnalyticsRange, number> = {
	"24h": 24 * 60 * 60 * 1000,
	"7d": 7 * 24 * 60 * 60 * 1000,
	"30d": 30 * 24 * 60 * 60 * 1000,
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

export function buildBucketStarts(
	range: AnalyticsRange,
	now: number,
): number[] {
	const bucketMs = BUCKET_SECONDS[range] * 1000;
	const lastStart = Math.floor(now / bucketMs) * bucketMs;
	const count = RANGE_MS[range] / bucketMs + 1;

	return Array.from(
		{ length: count },
		(_, index) => lastStart - (count - 1 - index) * bucketMs,
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
