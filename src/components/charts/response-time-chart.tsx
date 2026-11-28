"use client";

import { useSyncExternalStore } from "react";
import type { ChartBucket } from "@/lib/data/analytics-buckets";

type BucketTone = "healthy" | "degraded" | "down" | "empty";

type ResponseTimeChartProps = {
  buckets: ChartBucket[];
  showTime: boolean;
  label: string;
};

const toneStyles: Record<BucketTone, string> = {
  healthy: "bg-success",
  degraded: "bg-warning",
  down: "bg-danger",
  empty: "bg-border",
};

const toneLabels: Record<BucketTone, string> = {
  healthy: "All checks up",
  degraded: "Some checks failed",
  down: "All checks failed",
  empty: "No checks",
};

const subscribe = () => () => {};

// False during server rendering and the first client render, true afterwards,
// so locale-dependent text only appears once it can't cause a mismatch
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

function getBucketTone(bucket: ChartBucket): BucketTone {
  if (bucket.total === 0) {
    return "empty";
  }

  if (bucket.successful === bucket.total) {
    return "healthy";
  }

  return bucket.successful === 0 ? "down" : "degraded";
}

function formatBucketStart(
  value: string,
  showTime: boolean,
  isClient: boolean,
): string {
  if (!isClient) {
    return `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }

  return new Intl.DateTimeFormat(
    undefined,
    showTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" },
  ).format(new Date(value));
}

function formatResponseTime(value: number | null): string {
  return value === null ? "N/A" : `${value} ms`;
}

export function ResponseTimeChart({
  buckets,
  showTime,
  label,
}: ResponseTimeChartProps) {
  const isClient = useIsClient();

  const maxResponseTime = Math.max(
    1,
    ...buckets.map((bucket) => bucket.averageLatencyMs ?? 0),
  );

  return (
    <div>
      <div
        aria-label={label}
        className="flex h-40 items-end gap-1 pt-3"
        role="img"
      >
        {buckets.map((bucket) => {
          const tone = getBucketTone(bucket);
          const height =
            tone === "empty"
              ? 4
              : bucket.averageLatencyMs === null
                ? 8
                : Math.max(
                    8,
                    (bucket.averageLatencyMs / maxResponseTime) * 100,
                  );

          const when = formatBucketStart(bucket.start, showTime, isClient);

          return (
            <div
              className={`relative min-w-0 flex-1 rounded-t-sm ${toneStyles[tone]}`}
              key={bucket.start}
              style={{ height: `${height}%` }}
              title={
                tone === "empty"
                  ? `${when}: no checks`
                  : `${when}: ${bucket.successful} of ${bucket.total} checks up, average ${formatResponseTime(bucket.averageLatencyMs)}${bucket.slow ? " (unusually slow)" : ""}`
              }
            >
              {bucket.slow && (
                <span
                  aria-hidden="true"
                  className="absolute -top-2 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-fg"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-ui text-fg-muted">
        {(Object.keys(toneLabels) as BucketTone[]).map((tone) => (
          <span className="inline-flex items-center gap-2" key={tone}>
            <span
              aria-hidden="true"
              className={`size-2 rounded-sm ${toneStyles[tone]}`}
            />
            {toneLabels[tone]}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-fg" />
          Unusually slow
        </span>
      </div>
    </div>
  );
}
