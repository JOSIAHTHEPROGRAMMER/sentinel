import { flagSlowValues } from "./analytics-shared";

export type BucketRow = {
	bucket: number;
	total: number;
	successful: number;
	averageLatencyMs: number | null;
};

export type ChartBucket = {
	start: string;
	total: number;
	successful: number;
	averageLatencyMs: number | null;
	slow: boolean;
};

export function fillBuckets(
	rows: BucketRow[],
	starts: number[],
	bucketSeconds: number,
): ChartBucket[] {
	const rowsByStart = new Map(
		rows.map((row) => [row.bucket * bucketSeconds * 1000, row]),
	);

	const filled = starts.map((start) => {
		const row = rowsByStart.get(start);

		return {
			start: new Date(start).toISOString(),
			total: row?.total ?? 0,
			successful: row?.successful ?? 0,
			averageLatencyMs: row?.averageLatencyMs ?? null,
		};
	});

	const slow = flagSlowValues(filled.map((bucket) => bucket.averageLatencyMs));

	return filled.map((bucket, index) => ({
		...bucket,
		slow: slow[index] ?? false,
	}));
}
