import { describe, expect, it } from "vitest";
import { deriveMonitorStatus, type StatusInput } from "./monitor-status";

const now = Date.UTC(2026, 10, 22, 12, 0, 0);
const minutesAgo = (minutes: number) =>
	new Date(now - minutes * 60_000).toISOString();

function input(overrides: Partial<StatusInput> = {}): StatusInput {
	return {
		enabled: true,
		intervalSeconds: 300,
		updatedAt: minutesAgo(24 * 60),
		latestCheckedAt: minutesAgo(2),
		latestStatus: "up",
		...overrides,
	};
}

describe("deriveMonitorStatus", () => {
	it("reports up when the latest check succeeded recently", () => {
		expect(deriveMonitorStatus(input(), now)).toBe("up");
	});

	it("reports down for a failed, timed out or errored latest check", () => {
		for (const latestStatus of ["down", "timeout", "error"] as const) {
			expect(
				deriveMonitorStatus(input({ latestStatus }), now),
				latestStatus,
			).toBe("down");
		}
	});

	it("reports disabled regardless of recorded checks", () => {
		expect(deriveMonitorStatus(input({ enabled: false }), now)).toBe(
			"disabled",
		);
	});

	it("reports stale when the latest check is older than the staleness threshold", () => {
		expect(
			deriveMonitorStatus(input({ latestCheckedAt: minutesAgo(20) }), now),
		).toBe("stale");
	});

	it("reports stale rather than up when an old success has not been followed by a check", () => {
		expect(
			deriveMonitorStatus(
				input({ latestCheckedAt: minutesAgo(60), latestStatus: "up" }),
				now,
			),
		).toBe("stale");
	});

	it("reports no-data for a new monitor that has not been checked yet", () => {
		expect(
			deriveMonitorStatus(
				input({
					latestCheckedAt: null,
					latestStatus: null,
					updatedAt: minutesAgo(2),
				}),
				now,
			),
		).toBe("no-data");
	});

	it("reports stale for an old monitor that has never been checked", () => {
		expect(
			deriveMonitorStatus(
				input({ latestCheckedAt: null, latestStatus: null }),
				now,
			),
		).toBe("stale");
	});
});
