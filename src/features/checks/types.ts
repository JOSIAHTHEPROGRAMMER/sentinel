import type { CheckStatus } from "@/components/ui/check-status-badge";
import type { ChartBucket } from "@/lib/data/analytics-buckets";
import type { MonitorStatus } from "@/lib/data/monitor-status";

export type CheckResult = {
	id: string;
	checkedAt: string;
	status: CheckStatus;
	httpStatus: number | null;
	latencyMs: number | null;
	errorMessage: string | null;
};

export type CheckSummary = {
	totalChecks: number;
	successfulChecks: number;
	failedChecks: number;
	uptimePercentage: number | null;
	averageResponseTimeMs: number | null;
};

export type Overview = {
	status: MonitorStatus;
	latestCheckedAt: string | null;
	lastSuccessAt: string | null;
	lastIncident: {
		id: string;
		startedAt: string;
		resolvedAt: string | null;
		reason: string;
	} | null;
};

export type ChecksData = {
	range: string;
	windowStart: string;
	windowEnd: string;
	overview: Overview;
	summary: CheckSummary;
	buckets: ChartBucket[];
	checks: CheckResult[];
};

export type Incident = {
	id: string;
	startedAt: string;
	resolvedAt: string | null;
	reason: string;
};
