import { describe, expect, it } from "vitest";
import type { MonitorHealth } from "./monitor-health";
import { buildMonitorRows, type MonitorInput } from "./monitor-rows";

const NOW = Date.parse("2026-11-27T12:00:00.000Z");
const LONG_AGO = "2026-10-01T00:00:00.000Z";

function monitor(id: string, overrides: Partial<MonitorInput> = {}) {
  return {
    id,
    name: id,
    url: `https://${id}.example.com`,
    enabled: true,
    projectId: null,
    intervalSeconds: 300,
    timeoutMs: 10_000,
    updatedAt: LONG_AGO,
    ...overrides,
  };
}

function health(overrides: Partial<MonitorHealth> = {}): MonitorHealth {
  return {
    latestCheckedAt: new Date(NOW - 1000).toISOString(),
    latestStatus: "up",
    totalChecks: 4,
    successfulChecks: 3,
    ...overrides,
  };
}

describe("buildMonitorRows", () => {
  it("derives status, uptime and the last check time", () => {
    const [row] = buildMonitorRows([monitor("a")], { a: health() }, NOW);

    expect(row?.status).toBe("up");
    expect(row?.uptimePercentage).toBe(75);
    expect(row?.lastCheckedAt).toBe(new Date(NOW - 1000).toISOString());
  });

  it("reports a failing latest check as down", () => {
    const [row] = buildMonitorRows(
      [monitor("a")],
      { a: health({ latestStatus: "timeout" }) },
      NOW,
    );

    expect(row?.status).toBe("down");
  });

  it("treats a long-silent enabled monitor as stale and a paused one as disabled", () => {
    const rows = buildMonitorRows(
      [
        monitor("stale", { intervalSeconds: 60 }),
        monitor("paused", { enabled: false }),
      ],
      {
        stale: health({
          latestCheckedAt: "2026-10-27T00:00:00.000Z",
        }),
        paused: health(),
      },
      NOW,
    );

    expect(rows.find((row) => row.id === "stale")?.status).toBe("stale");
    expect(rows.find((row) => row.id === "paused")?.status).toBe("disabled");
  });

  it("gives a monitor without checks no uptime and no last check", () => {
    const [row] = buildMonitorRows([monitor("a")], {}, NOW);

    expect(row?.uptimePercentage).toBeNull();
    expect(row?.lastCheckedAt).toBeNull();
  });

  it("puts monitors that need attention first and keeps creation order within a status", () => {
    const rows = buildMonitorRows(
      [
        monitor("up-1"),
        monitor("down-1"),
        monitor("paused", { enabled: false }),
        monitor("up-2"),
        monitor("down-2"),
      ],
      {
        "up-1": health(),
        "down-1": health({ latestStatus: "down" }),
        paused: health(),
        "up-2": health(),
        "down-2": health({ latestStatus: "error" }),
      },
      NOW,
    );

    expect(rows.map((row) => row.id)).toEqual([
      "down-1",
      "down-2",
      "up-1",
      "up-2",
      "paused",
    ]);
  });
});
