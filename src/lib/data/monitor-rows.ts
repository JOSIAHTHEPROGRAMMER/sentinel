import { calculateUptimePercentage } from "./analytics-shared";
import type { MonitorHealth } from "./monitor-health";
import { deriveMonitorStatus, type MonitorStatus } from "./monitor-status";

export type MonitorInput = {
	id: string;
	name: string;
	url: string;
	enabled: boolean;
	projectId: string | null;
	intervalSeconds: number;
	timeoutMs: number;
	updatedAt: string;
};

export type MonitorRow = MonitorInput & {
	status: MonitorStatus;
	uptimePercentage: number | null;
	lastCheckedAt: string | null;
};

// Lower sorts first, so monitors that need attention lead every list
const STATUS_RANK: Record<MonitorStatus, number> = {
	down: 0,
	stale: 1,
	"no-data": 2,
	up: 3,
	disabled: 4,
};

export function buildMonitorRows(
	monitors: MonitorInput[],
	health: Record<string, MonitorHealth>,
	now: number,
): MonitorRow[] {
	const rows = monitors.map((monitor) => {
		const item = health[monitor.id];

		return {
			...monitor,
			status: deriveMonitorStatus(
				{
					enabled: monitor.enabled,
					intervalSeconds: monitor.intervalSeconds,
					updatedAt: monitor.updatedAt,
					latestCheckedAt: item?.latestCheckedAt ?? null,
					latestStatus: item?.latestStatus ?? null,
				},
				now,
			),
			uptimePercentage: calculateUptimePercentage(
				item?.successfulChecks ?? 0,
				item?.totalChecks ?? 0,
			),
			lastCheckedAt: item?.latestCheckedAt ?? null,
		};
	});

	// The sort is stable, so creation order is kept within each status
	return rows.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
}
