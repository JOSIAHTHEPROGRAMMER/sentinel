import {
	ANALYTICS_RANGES,
	type AnalyticsRange,
	rangeToMs,
} from "./analytics-shared";

export const INCIDENT_STATUSES = ["all", "open", "resolved"] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_RANGES = [...ANALYTICS_RANGES, "all"] as const;

export type IncidentRange = (typeof INCIDENT_RANGES)[number];

export type IncidentFilters = {
	status: IncidentStatus;
	range: IncidentRange;
	monitorId: string | null;
	projectId: string | null;
};

export type IncidentStats = {
	total: number;
	open: number;
	resolved: number;
	averageResolutionMs: number | null;
	perDay: number | null;
};

export const DEFAULT_INCIDENT_FILTERS: IncidentFilters = {
	status: "all",
	range: "30d",
	monitorId: null,
	projectId: null,
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function pick<T extends string>(
	options: readonly T[],
	value: string | undefined,
	fallback: T,
): T {
	return options.find((option) => option === value) ?? fallback;
}

function uuidOrNull(value: string | undefined): string | null {
	return value !== undefined && UUID_PATTERN.test(value) ? value : null;
}

export function parseIncidentFilters(params: SearchParams): IncidentFilters {
	return {
		status: pick(
			INCIDENT_STATUSES,
			single(params.status),
			DEFAULT_INCIDENT_FILTERS.status,
		),
		range: pick(
			INCIDENT_RANGES,
			single(params.range),
			DEFAULT_INCIDENT_FILTERS.range,
		),
		monitorId: uuidOrNull(single(params.monitor)),
		projectId: uuidOrNull(single(params.project)),
	};
}

export function incidentRangeStart(
	range: IncidentRange,
	now: number,
): Date | null {
	return range === "all" ? null : new Date(now - rangeToMs(range));
}

export function incidentsPerDay(
	count: number,
	range: IncidentRange,
): number | null {
	if (range === "all") {
		return null;
	}

	const days = rangeToMs(range as AnalyticsRange) / 86_400_000;

	return Math.round((count / days) * 100) / 100;
}
