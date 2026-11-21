const GRACE_MS = 60_000;

export type StalenessInput = {
	enabled: boolean;
	intervalSeconds: number;
	updatedAt: string;
	lastCheckedAt: string | null;
};

export function staleThresholdMs(intervalSeconds: number): number {
	return intervalSeconds * 2 * 1000 + GRACE_MS;
}

export function isMonitorStale(monitor: StalenessInput, now: number): boolean {
	if (!monitor.enabled) {
		return false;
	}

	const updatedAt = new Date(monitor.updatedAt).getTime();
	const lastCheckedAt = monitor.lastCheckedAt
		? new Date(monitor.lastCheckedAt).getTime()
		: Number.NEGATIVE_INFINITY;
	const reference = Math.max(updatedAt, lastCheckedAt);

	if (!Number.isFinite(reference)) {
		return false;
	}

	return now - reference > staleThresholdMs(monitor.intervalSeconds);
}
