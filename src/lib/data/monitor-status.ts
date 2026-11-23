import { isMonitorStale } from "./staleness";

export type MonitorStatus = "disabled" | "no-data" | "stale" | "up" | "down";

export type StatusInput = {
	enabled: boolean;
	intervalSeconds: number;
	updatedAt: string;
	latestCheckedAt: string | null;
	latestStatus: "up" | "down" | "timeout" | "error" | null;
};

export function deriveMonitorStatus(
	input: StatusInput,
	now: number,
): MonitorStatus {
	if (!input.enabled) {
		return "disabled";
	}

	const stale = isMonitorStale(
		{
			enabled: input.enabled,
			intervalSeconds: input.intervalSeconds,
			updatedAt: input.updatedAt,
			lastCheckedAt: input.latestCheckedAt,
		},
		now,
	);

	if (!input.latestCheckedAt || !input.latestStatus) {
		// A brand-new monitor gets a grace period before it counts as stale
		return stale ? "stale" : "no-data";
	}

	if (stale) {
		return "stale";
	}

	return input.latestStatus === "up" ? "up" : "down";
}
