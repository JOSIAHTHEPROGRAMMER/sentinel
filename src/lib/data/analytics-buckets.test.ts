import { describe, expect, it } from "vitest";
import { fillBuckets } from "./analytics-buckets";

const HOUR = 3_600_000;
const start = Date.UTC(2026, 10, 22, 0);
const starts = [0, 1, 2, 3, 4, 5, 6].map((index) => start + index * HOUR);
const bucketIndex = (index: number) => (start + index * HOUR) / HOUR;

function row(index: number, averageLatencyMs: number | null, total = 10) {
	return {
		bucket: bucketIndex(index),
		total,
		successful: total,
		averageLatencyMs,
	};
}

describe("fillBuckets", () => {
	it("returns one bucket per start, in order, as ISO strings", () => {
		const buckets = fillBuckets([], starts, 3600);

		expect(buckets).toHaveLength(7);
		expect(buckets.map((bucket) => bucket.start)).toEqual(
			starts.map((value) => new Date(value).toISOString()),
		);
	});

	it("fills empty buckets with zero counts and no latency", () => {
		const [first] = fillBuckets([], starts, 3600);

		expect(first).toEqual({
			start: new Date(start).toISOString(),
			total: 0,
			successful: 0,
			averageLatencyMs: null,
			slow: false,
		});
	});

	it("places each row in the bucket it belongs to", () => {
		const buckets = fillBuckets([row(2, 120, 4)], starts, 3600);

		expect(buckets[2]).toMatchObject({
			total: 4,
			successful: 4,
			averageLatencyMs: 120,
		});
		expect(buckets[1]?.total).toBe(0);
		expect(buckets[3]?.total).toBe(0);
	});

	it("ignores rows that fall outside the requested buckets", () => {
		const buckets = fillBuckets([row(40, 100)], starts, 3600);

		expect(buckets.every((bucket) => bucket.total === 0)).toBe(true);
	});

	it("flags a bucket whose latency is far above the rest", () => {
		const rows = [0, 1, 2, 3, 4, 5].map((index) => row(index, 100));
		rows.push(row(6, 1000));

		const buckets = fillBuckets(rows, starts, 3600);

		expect(buckets[6]?.slow).toBe(true);
		expect(buckets.slice(0, 6).every((bucket) => !bucket.slow)).toBe(true);
	});

	it("never flags an empty bucket", () => {
		const rows = [0, 1, 2, 3, 4].map((index) => row(index, 100));

		const buckets = fillBuckets(rows, starts, 3600);

		expect(buckets[5]?.slow).toBe(false);
		expect(buckets[6]?.slow).toBe(false);
	});
});
