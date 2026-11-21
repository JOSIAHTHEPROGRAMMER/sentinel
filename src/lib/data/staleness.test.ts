import { describe, expect, it } from "vitest";
import { isMonitorStale, staleThresholdMs } from "./staleness";

const now = Date.UTC(2026, 10, 18, 12, 0, 0);

function monitor(
	overrides: Partial<Parameters<typeof isMonitorStale>[0]> = {},
) {
	return {
		enabled: true,
		intervalSeconds: 300,
		updatedAt: new Date(now - 24 * 60 * 60_000).toISOString(),
		lastCheckedAt: null,
		...overrides,
	};
}

describe("staleThresholdMs", () => {
	it("is two intervals plus a minute of grace", () => {
		expect(staleThresholdMs(300)).toBe(660_000);
	});
});

describe("isMonitorStale", () => {
	it("never flags disabled monitors", () => {
		expect(isMonitorStale(monitor({ enabled: false }), now)).toBe(false);
	});

	it("is not stale when a check ran recently", () => {
		const lastCheckedAt = new Date(now - 4 * 60_000).toISOString();

		expect(isMonitorStale(monitor({ lastCheckedAt }), now)).toBe(false);
	});

	it("is stale when the last check is past the threshold", () => {
		const lastCheckedAt = new Date(now - 20 * 60_000).toISOString();

		expect(isMonitorStale(monitor({ lastCheckedAt }), now)).toBe(true);
	});

	it("is stale when an old monitor has never been checked", () => {
		expect(isMonitorStale(monitor(), now)).toBe(true);
	});

	it("gives a new monitor a grace period before its first check", () => {
		const updatedAt = new Date(now - 2 * 60_000).toISOString();

		expect(isMonitorStale(monitor({ updatedAt }), now)).toBe(false);
	});

	it("gives a re-enabled monitor a grace period despite an old last check", () => {
		const updatedAt = new Date(now - 60_000).toISOString();
		const lastCheckedAt = new Date(now - 3 * 24 * 60 * 60_000).toISOString();

		expect(isMonitorStale(monitor({ updatedAt, lastCheckedAt }), now)).toBe(
			false,
		);
	});

	it("ignores invalid timestamps instead of flagging", () => {
		expect(isMonitorStale(monitor({ updatedAt: "not-a-date" }), now)).toBe(
			false,
		);
	});
});
