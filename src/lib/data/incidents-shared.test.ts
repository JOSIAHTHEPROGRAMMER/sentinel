import { describe, expect, it } from "vitest";
import {
	DEFAULT_INCIDENT_FILTERS,
	incidentRangeStart,
	incidentsPerDay,
	parseIncidentFilters,
} from "./incidents-shared";

const monitorId = "32bc70f6-c55f-4034-8bd7-f45bc84abab0";
const projectId = "550e8400-e29b-41d4-a716-446655440000";

describe("parseIncidentFilters", () => {
	it("returns the defaults when no params are given", () => {
		expect(parseIncidentFilters({})).toEqual(DEFAULT_INCIDENT_FILTERS);
	});

	it("accepts valid values", () => {
		expect(
			parseIncidentFilters({
				status: "open",
				range: "7d",
				monitor: monitorId,
				project: projectId,
			}),
		).toEqual({
			status: "open",
			range: "7d",
			monitorId,
			projectId,
		});
	});

	it("accepts the all range", () => {
		expect(parseIncidentFilters({ range: "all" }).range).toBe("all");
	});

	it("falls back to defaults for unsupported status and range values", () => {
		const filters = parseIncidentFilters({ status: "closed", range: "90d" });

		expect(filters.status).toBe(DEFAULT_INCIDENT_FILTERS.status);
		expect(filters.range).toBe(DEFAULT_INCIDENT_FILTERS.range);
	});

	it("ignores repeated params instead of picking one", () => {
		const filters = parseIncidentFilters({
			status: ["open", "resolved"],
			monitor: [monitorId, monitorId],
		});

		expect(filters.status).toBe(DEFAULT_INCIDENT_FILTERS.status);
		expect(filters.monitorId).toBeNull();
	});

	it("drops monitor and project ids that are not UUIDs", () => {
		const filters = parseIncidentFilters({
			monitor: "1; DROP TABLE monitors",
			project: "not-a-uuid",
		});

		expect(filters.monitorId).toBeNull();
		expect(filters.projectId).toBeNull();
	});
});

describe("incidentRangeStart", () => {
	const now = Date.UTC(2026, 10, 21, 12, 0, 0);

	it("returns no start for the all range", () => {
		expect(incidentRangeStart("all", now)).toBeNull();
	});

	it("subtracts the range from the current time", () => {
		expect(incidentRangeStart("24h", now)?.getTime()).toBe(now - 86_400_000);
		expect(incidentRangeStart("7d", now)?.getTime()).toBe(now - 7 * 86_400_000);
		expect(incidentRangeStart("30d", now)?.getTime()).toBe(
			now - 30 * 86_400_000,
		);
	});
});

describe("incidentsPerDay", () => {
	it("returns null for the all range because there is no fixed window", () => {
		expect(incidentsPerDay(12, "all")).toBeNull();
	});

	it("divides by the length of the range in days", () => {
		expect(incidentsPerDay(5, "24h")).toBe(5);
		expect(incidentsPerDay(7, "7d")).toBe(1);
		expect(incidentsPerDay(30, "30d")).toBe(1);
	});

	it("rounds to two decimals", () => {
		expect(incidentsPerDay(3, "30d")).toBe(0.1);
		expect(incidentsPerDay(1, "7d")).toBe(0.14);
	});

	it("returns zero when there are no incidents", () => {
		expect(incidentsPerDay(0, "30d")).toBe(0);
	});
});
