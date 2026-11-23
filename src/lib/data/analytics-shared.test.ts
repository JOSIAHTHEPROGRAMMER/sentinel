import { describe, expect, it } from "vitest";
import {
	bucketSecondsForRange,
	bucketSecondsForSpan,
	buildBucketStarts,
	buildBucketStartsForWindow,
	calculateUptimePercentage,
	DEFAULT_ANALYTICS_RANGE,
	flagSlowValues,
	MAX_CUSTOM_WINDOW_MS,
	MIN_CUSTOM_WINDOW_MS,
	parseAnalyticsRange,
	parseCustomWindow,
	rangeToMs,
	windowForRange,
} from "./analytics-shared";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

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

describe("bucketSecondsForSpan", () => {
	it("matches the preset ranges", () => {
		expect(bucketSecondsForSpan(rangeToMs("24h"))).toBe(
			bucketSecondsForRange("24h"),
		);
		expect(bucketSecondsForSpan(rangeToMs("7d"))).toBe(
			bucketSecondsForRange("7d"),
		);
		expect(bucketSecondsForSpan(rangeToMs("30d"))).toBe(
			bucketSecondsForRange("30d"),
		);
	});

	it("switches bucket size just past each boundary", () => {
		expect(bucketSecondsForSpan(2 * DAY)).toBe(3600);
		expect(bucketSecondsForSpan(2 * DAY + 1)).toBe(21_600);
		expect(bucketSecondsForSpan(10 * DAY)).toBe(21_600);
		expect(bucketSecondsForSpan(10 * DAY + 1)).toBe(86_400);
		expect(bucketSecondsForSpan(90 * DAY)).toBe(86_400);
	});
});

describe("windowForRange", () => {
	it("ends now and starts one range earlier", () => {
		const now = Date.UTC(2026, 10, 22, 12);

		expect(windowForRange("7d", now)).toEqual({
			startMs: now - 7 * DAY,
			endMs: now,
		});
	});
});

describe("parseCustomWindow", () => {
	const now = Date.UTC(2026, 10, 22, 12);

	it("accepts a valid window", () => {
		const result = parseCustomWindow(
			"2026-11-10T00:00:00Z",
			"2026-11-12T00:00:00Z",
			now,
		);

		expect(result).toEqual({
			valid: true,
			window: {
				startMs: Date.UTC(2026, 10, 10),
				endMs: Date.UTC(2026, 10, 12),
			},
		});
	});

	it("clamps an end in the future to now", () => {
		const result = parseCustomWindow(
			"2026-11-20T00:00:00Z",
			"2026-12-31T00:00:00Z",
			now,
		);

		expect(result).toMatchObject({ valid: true, window: { endMs: now } });
	});

	it("rejects missing or repeated params", () => {
		expect(
			parseCustomWindow(undefined, "2026-11-12T00:00:00Z", now),
		).toMatchObject({ valid: false });
		expect(
			parseCustomWindow(["2026-11-10T00:00:00Z"], "2026-11-12T00:00:00Z", now),
		).toMatchObject({ valid: false });
	});

	it("rejects dates that cannot be parsed", () => {
		expect(
			parseCustomWindow("banana", "2026-11-12T00:00:00Z", now),
		).toMatchObject({ valid: false });
	});

	it("rejects a start that is not before the end", () => {
		expect(
			parseCustomWindow("2026-11-12T00:00:00Z", "2026-11-10T00:00:00Z", now),
		).toMatchObject({ valid: false });
		expect(
			parseCustomWindow("2026-11-12T00:00:00Z", "2026-11-12T00:00:00Z", now),
		).toMatchObject({ valid: false });
	});

	it("rejects a start in the future", () => {
		expect(
			parseCustomWindow("2026-12-01T00:00:00Z", "2026-12-02T00:00:00Z", now),
		).toMatchObject({ valid: false });
	});

	it("enforces the minimum and maximum span", () => {
		const start = Date.UTC(2026, 10, 1);

		expect(
			parseCustomWindow(
				new Date(start).toISOString(),
				new Date(start + MIN_CUSTOM_WINDOW_MS - 1).toISOString(),
				now,
			),
		).toMatchObject({ valid: false });

		expect(
			parseCustomWindow(
				new Date(start).toISOString(),
				new Date(start + MIN_CUSTOM_WINDOW_MS).toISOString(),
				now,
			),
		).toMatchObject({ valid: true });

		const longStart = now - MAX_CUSTOM_WINDOW_MS;

		expect(
			parseCustomWindow(
				new Date(longStart).toISOString(),
				new Date(now).toISOString(),
				now,
			),
		).toMatchObject({ valid: true });

		expect(
			parseCustomWindow(
				new Date(longStart - 1).toISOString(),
				new Date(now).toISOString(),
				now,
			),
		).toMatchObject({ valid: false });
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

describe("buildBucketStartsForWindow", () => {
	it("covers a custom window with evenly spaced buckets", () => {
		const window = {
			startMs: Date.UTC(2026, 10, 20, 10, 30),
			endMs: Date.UTC(2026, 10, 22, 12, 15),
		};

		const starts = buildBucketStartsForWindow(window, 3600);

		expect(starts).toHaveLength(51);
		expect(starts[0]).toBe(Date.UTC(2026, 10, 20, 10));
		expect(starts.at(-1)).toBe(Date.UTC(2026, 10, 22, 12));

		for (let index = 1; index < starts.length; index++) {
			expect((starts[index] ?? 0) - (starts[index - 1] ?? 0)).toBe(HOUR);
		}
	});

	it("returns a single bucket when the window sits inside one bucket", () => {
		const window = {
			startMs: Date.UTC(2026, 10, 22, 10, 5),
			endMs: Date.UTC(2026, 10, 22, 10, 55),
		};

		expect(buildBucketStartsForWindow(window, 3600)).toEqual([
			Date.UTC(2026, 10, 22, 10),
		]);
	});
});

describe("flagSlowValues", () => {
	it("flags nothing when there are too few samples", () => {
		expect(flagSlowValues([100, 100, 100, 5000])).toEqual([
			false,
			false,
			false,
			false,
		]);
	});

	it("flags a value far above the median", () => {
		expect(flagSlowValues([100, 100, 100, 100, 100, 1000])).toEqual([
			false,
			false,
			false,
			false,
			false,
			true,
		]);
	});

	it("does not flag values under the absolute floor", () => {
		expect(flagSlowValues([100, 100, 100, 100, 100, 300])).toEqual([
			false,
			false,
			false,
			false,
			false,
			false,
		]);
	});

	it("uses twice the median as the threshold when it is above the floor", () => {
		expect(flagSlowValues([400, 400, 400, 400, 400, 800])[5]).toBe(false);
		expect(flagSlowValues([400, 400, 400, 400, 400, 900])[5]).toBe(true);
	});

	it("skips null values and keeps positions aligned", () => {
		expect(flagSlowValues([null, 100, 100, 100, 100, 100, 1000])).toEqual([
			false,
			false,
			false,
			false,
			false,
			false,
			true,
		]);
	});
});
