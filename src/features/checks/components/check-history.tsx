"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Tabs, tabPanelProps } from "@/components/ui/tabs";
import { DEFAULT_ANALYTICS_RANGE } from "@/lib/data/analytics-shared";
import type { ChecksData, Incident } from "../types";
import { HistoryTab } from "./history-tab";
import { IncidentsTab } from "./incidents-tab";
import { MonitorOverview } from "./monitor-overview";
import { PerformanceTab } from "./performance-tab";

type CheckHistoryProps = {
  monitorId: string;
  initialData: ChecksData;
  initialNow: number;
  incidents: Incident[];
  // Receives a function that reloads the performance data, for after a save
  configuration: (reload: () => void) => ReactNode;
};

type ChecksResponse = Partial<ChecksData> & { error?: string };

const PREFIX = "monitor";

export function CheckHistory({
  monitorId,
  initialData,
  initialNow,
  incidents,
  configuration,
}: CheckHistoryProps) {
  const [tab, setTab] = useState("performance");
  const [data, setData] = useState(initialData);
  const [loadedAt, setLoadedAt] = useState(initialNow);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryRef = useRef(`range=${DEFAULT_ANALYTICS_RANGE}`);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function load(query: string) {
    queryRef.current = query;
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/monitors/${monitorId}/checks?${query}`,
        { signal: controller.signal },
      );
      const body: ChecksResponse = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Failed to load check history");
      }

      if (
        !body.range ||
        !body.windowStart ||
        !body.windowEnd ||
        !body.overview ||
        !body.summary ||
        !body.buckets ||
        !body.checks
      ) {
        throw new Error("Failed to load check history");
      }

      setData({
        range: body.range,
        windowStart: body.windowStart,
        windowEnd: body.windowEnd,
        overview: body.overview,
        summary: body.summary,
        buckets: body.buckets,
        checks: body.checks,
      });
      setLoadedAt(Date.now());
    } catch (cause) {
      if (controller.signal.aborted) {
        return;
      }

      setError(
        cause instanceof Error ? cause.message : "Failed to load check history",
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }

  const reload = () => void load(queryRef.current);

  return (
    <div className="space-y-6">
      <MonitorOverview overview={data.overview} now={loadedAt} />

      <div className="space-y-4">
        <Tabs
          idPrefix={PREFIX}
          label="Monitor sections"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "performance", label: "Performance" },
            { id: "history", label: "History" },
            { id: "incidents", label: "Incidents", count: incidents.length },
            { id: "configuration", label: "Configuration" },
          ]}
        />

        {tab === "performance" && (
          <div {...tabPanelProps(PREFIX, "performance")}>
            <PerformanceTab
              data={data}
              loading={loading}
              error={error}
              onRetry={reload}
              onChangeQuery={(query) => void load(query)}
            />
          </div>
        )}

        {tab === "history" && (
          <div {...tabPanelProps(PREFIX, "history")}>
            <HistoryTab checks={data.checks} />
          </div>
        )}

        {tab === "incidents" && (
          <div {...tabPanelProps(PREFIX, "incidents")}>
            <IncidentsTab incidents={incidents} now={loadedAt} />
          </div>
        )}

        {/* Hidden rather than unmounted so unsaved form edits survive tab switches */}
        <div
          {...tabPanelProps(PREFIX, "configuration")}
          hidden={tab !== "configuration"}
        >
          {configuration(reload)}
        </div>
      </div>
    </div>
  );
}
