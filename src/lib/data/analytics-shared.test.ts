import { describe, expect, it } from "vitest";
import {
	bucketSecondsForRange,
	buildBucketStarts,
	calculateUptimePercentage,
	DEFAULT_ANALYTICS_RANGE,
	parseAnalyticsRange,
	rangeToMs,
} from "./analytics-shared";

describe("parseAnalyticsRange", () => {
	it("accepts supported ranges", () => {
		expect(parseAnalyticsRange("24h")).toBe("24h");
		expect(parseAnalyticsRange("7d")).toBe("7d");
		expect(parseAnalyticsRange("30d")).toBe("30d");
	});

	it("falls back to the default for missing or unsupported values", () => {
		expect(parseAnalyticsRange(undefined)).toBe(DEFAULT_ANALYTICS_RANGE);
		expect(parseAnalyticsRange("90d")).toBe(DEFAULT_ANALYTICS_RANGE);
		expect(parseAnalyticsRange("")).toBe(DEFAULT_ANALYTICS_RANGE);
		expect(parseAnalyticsRange(["7d", "30d"])).toBe(DEFAULT_ANALYTICS_RANGE);
	});
});

describe("rangeToMs", () => {
	it("converts ranges to milliseconds", () => {
		expect(rangeToMs("24h")).toBe(86_400_000);
		expect(rangeToMs("7d")).toBe(7 * 86_400_000);
		expect(rangeToMs("30d")).toBe(30 * 86_400_000);
	});
});

describe("calculateUptimePercentage", () => {
	it("returns null when there are no checks", () => {
		expect(calculateUptimePercentage(0, 0)).toBeNull();
	});

	it("returns 100 when every check succeeded", () => {
		expect(calculateUptimePercentage(10, 10)).toBe(100);
	});

	it("returns 0 when every check failed", () => {
		expect(calculateUptimePercentage(0, 10)).toBe(0);
	});

	it("floors to two decimals so near-perfect uptime is not shown as 100", () => {
		expect(calculateUptimePercentage(9999, 10000)).toBe(99.99);
		expect(calculateUptimePercentage(2, 3)).toBe(66.66);
		expect(calculateUptimePercentage(1, 3)).toBe(33.33);
	});
});

describe("bucketSecondsForRange", () => {
	it("uses coarser buckets for longer ranges", () => {
		expect(bucketSecondsForRange("24h")).toBe(3600);
		expect(bucketSecondsForRange("7d")).toBe(21_600);
		expect(bucketSecondsForRange("30d")).toBe(86_400);
	});
});

describe("buildBucketStarts", () => {
	const now = Date.UTC(2026, 10, 17, 10, 30);

	it("covers the 24h range with hourly buckets ending at the current hour", () => {
		const starts = buildBucketStarts("24h", now);

		expect(starts).toHaveLength(25);
		expect(starts.at(-1)).toBe(Date.UTC(2026, 10, 17, 10));
		expect(starts[0]).toBe(Date.UTC(2026, 10, 16, 10));
	});

	it("covers the 7d range with six hour buckets", () => {
		const starts = buildBucketStarts("7d", now);

		expect(starts).toHaveLength(29);
		expect(starts.at(-1)).toBe(Date.UTC(2026, 10, 17, 6));
	});

	it("covers the 30d range with daily buckets", () => {
		const starts = buildBucketStarts("30d", now);

		expect(starts).toHaveLength(31);
		expect(starts.at(-1)).toBe(Date.UTC(2026, 10, 17));
	});

	it("starts the first bucket at or before the start of the range", () => {
		for (const range of ["24h", "7d", "30d"] as const) {
			const starts = buildBucketStarts(range, now);

			expect(starts[0]).toBeLessThanOrEqual(now - rangeToMs(range));
		}
	});
});
