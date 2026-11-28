"use client";

import {
  Activity,
  CircleCheck,
  CircleMinus,
  CircleX,
  Plus,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ResponseTimeChart } from "@/components/charts/response-time-chart";
import { Button, buttonStyles } from "@/components/ui/button";
import { type Column, DataTable, RowLink } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure } from "@/components/ui/figure";
import { LocalDate } from "@/components/ui/local-date";
import { MonitorStatusBadge } from "@/components/ui/monitor-status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/cn";
import type { ChartBucket } from "@/lib/data/analytics-buckets";
import {
  ANALYTICS_RANGES,
  type AnalyticsRange,
  type AnalyticsSummary,
} from "@/lib/data/analytics-shared";
import type { MonitorRow } from "@/lib/data/monitor-rows";
import type { RecentIncident } from "@/lib/data/recent-incidents";
import { formatDurationMs } from "@/lib/format-duration";
import { formatInterval } from "@/lib/format-interval";

type DashboardClientProps = {
  rows: MonitorRow[];
  analytics: AnalyticsSummary;
  trend: ChartBucket[];
  openIncidents: RecentIncident[];
  resolvedIncidents: RecentIncident[];
  now: number;
};

const RANGE_LABELS: Record<AnalyticsRange, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

type Summary = {
  tone: "success" | "danger" | "warning" | "neutral";
  text: string;
};

function summarize(rows: MonitorRow[]): Summary {
  const count = (status: MonitorRow["status"]) =>
    rows.filter((row) => row.status === status).length;
  const down = count("down");
  const stale = count("stale");
  const waiting = count("no-data");
  const enabled = rows.filter((row) => row.enabled).length;

  if (down > 0) {
    return {
      tone: "danger",
      text: `${down} of ${rows.length} ${rows.length === 1 ? "monitor is" : "monitors are"} down`,
    };
  }

  if (stale > 0) {
    return {
      tone: "warning",
      text: `${stale} ${stale === 1 ? "monitor has" : "monitors have"} not reported a check recently. If this persists, check that the monitoring worker is running.`,
    };
  }

  if (enabled === 0) {
    return { tone: "neutral", text: "All monitors are paused" };
  }

  if (waiting > 0) {
    return {
      tone: "neutral",
      text: `${waiting} ${waiting === 1 ? "monitor is" : "monitors are"} waiting for the first check`,
    };
  }

  return {
    tone: "success",
    text: `All ${enabled} active ${enabled === 1 ? "monitor is" : "monitors are"} operational`,
  };
}

const summaryStyles = {
  success: { icon: CircleCheck, className: "text-success" },
  danger: { icon: CircleX, className: "text-danger" },
  warning: { icon: TriangleAlert, className: "text-warning" },
  neutral: { icon: CircleMinus, className: "text-neutral" },
};

export default function DashboardClient({
  rows,
  analytics,
  trend,
  openIncidents,
  resolvedIncidents,
  now,
}: DashboardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  function changeRange(range: AnalyticsRange) {
    if (range === analytics.range) {
      return;
    }

    startTransition(() => {
      router.push(`/dashboard?range=${range}`, { scroll: false });
    });
  }

  const summary = summarize(rows);
  const SummaryIcon = summaryStyles[summary.tone].icon;
  const hasChecks = analytics.totalChecks > 0;

  const columns: Column<MonitorRow>[] = [
    {
      key: "status",
      header: "Status",
      cell: (row) => <MonitorStatusBadge status={row.status} />,
    },
    {
      key: "monitor",
      header: "Monitor",
      cell: (row) => (
        <div className="min-w-0 max-w-sm">
          <RowLink href={`/monitors/${row.id}`}>{row.name}</RowLink>
          <p className="truncate font-mono text-xs text-fg-subtle">{row.url}</p>
        </div>
      ),
    },
    {
      key: "uptime",
      header: "Uptime (24h)",
      align: "right",
      cell: (row) =>
        row.uptimePercentage === null
          ? "N/A"
          : `${row.uptimePercentage.toFixed(2)}%`,
    },
    {
      key: "last",
      header: "Last check",
      align: "right",
      cell: (row) =>
        row.lastCheckedAt
          ? `${formatDurationMs(now - new Date(row.lastCheckedAt).getTime())} ago`
          : "Never",
    },
    {
      key: "interval",
      header: "Interval",
      align: "right",
      cell: (row) => formatInterval(row.intervalSeconds),
    },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        actions={
          <>
            <Button variant="secondary" onClick={refresh} loading={isPending}>
              Refresh
            </Button>
            <Link
              href="/monitors/new"
              className={buttonStyles({ variant: "primary" })}
            >
              <Plus aria-hidden="true" className="size-4" />
              Add monitor
            </Link>
          </>
        }
      />

      {rows.length > 0 && (
        <section
          aria-label="Current status"
          className="rounded-panel border border-border bg-surface"
        >
          <div role="status" className="flex items-start gap-3 px-4 py-3">
            <SummaryIcon
              aria-hidden="true"
              className={cn(
                "mt-0.5 size-5 shrink-0",
                summaryStyles[summary.tone].className,
              )}
            />
            <p className="text-sm font-medium text-fg">{summary.text}</p>
          </div>

          {openIncidents.length > 0 && (
            <ul className="divide-y divide-border border-t border-border">
              {openIncidents.map((incident) => (
                <li key={incident.id}>
                  <Link
                    href={`/incidents/${incident.id}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-raised"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-fg">
                        {incident.monitorName}
                      </span>
                      <span className="ml-2 text-fg-muted">
                        {incident.reason}
                      </span>
                    </span>
                    <span className="text-ui text-fg-subtle">
                      Started <LocalDate value={incident.startedAt} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Panel
        title="Performance"
        description={RANGE_LABELS[analytics.range]}
        actions={
          <SegmentedControl
            label="Time range"
            value={analytics.range}
            onChange={(value) => changeRange(value as AnalyticsRange)}
            options={ANALYTICS_RANGES.map((range) => ({
              value: range,
              label: range,
            }))}
          />
        }
        className={cn("transition-opacity", isPending && "opacity-60")}
      >
        <div className="grid gap-6 sm:grid-cols-3">
          <Figure
            label="Uptime"
            value={
              analytics.uptimePercentage === null
                ? "N/A"
                : `${analytics.uptimePercentage.toFixed(2)}%`
            }
            detail={
              hasChecks
                ? `${analytics.successfulChecks} of ${analytics.totalChecks} checks succeeded`
                : "No checks in this period"
            }
          />
          <Figure
            label="Average response time"
            value={
              analytics.averageResponseTimeMs === null
                ? "N/A"
                : `${analytics.averageResponseTimeMs} ms`
            }
            detail="Successful checks only"
          />
          <Figure
            label="Checks"
            value={analytics.totalChecks.toLocaleString("en-US")}
            detail={`${analytics.failedChecks} failed. ${analytics.incidentsStarted} incidents started, ${analytics.incidentsResolved} resolved`}
          />
        </div>

        <div className="mt-6 border-t border-border pt-4">
          {hasChecks ? (
            <ResponseTimeChart
              buckets={trend}
              showTime={analytics.range !== "30d"}
              label="Average response time per interval across all monitors"
            />
          ) : (
            <p className="text-sm text-fg-muted">
              A chart will appear once checks are recorded in this period.
            </p>
          )}
        </div>

        <p className="mt-4 text-ui text-fg-subtle">
          Uptime is successful checks over all checks. Timeouts and errors count
          as down. An interval is marked unusually slow when it is above twice
          the median and at least 500 ms.
        </p>
      </Panel>

      <Panel
        title="Monitors"
        description={`${rows.length} ${rows.length === 1 ? "monitor" : "monitors"}, problems first`}
        flush
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No monitors yet"
            description="Add an endpoint to start recording checks."
            action={
              <Link
                href="/monitors/new"
                className={buttonStyles({ variant: "primary" })}
              >
                Create your first monitor
              </Link>
            }
          />
        ) : (
          <DataTable
            interactive
            caption="Monitors and their current status"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
          />
        )}
      </Panel>

      {resolvedIncidents.length > 0 && (
        <Panel title="Recently resolved" flush>
          <ul className="divide-y divide-border">
            {resolvedIncidents.map((incident) => (
              <li key={incident.id}>
                <Link
                  href={`/incidents/${incident.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-raised"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-fg">
                      {incident.monitorName}
                    </span>
                    <span className="ml-2 text-fg-muted">
                      {incident.reason}
                    </span>
                  </span>
                  <span className="text-ui text-fg-subtle">
                    <LocalDate value={incident.startedAt} />
                    {incident.resolvedAt &&
                      `, lasted ${formatDurationMs(
                        new Date(incident.resolvedAt).getTime() -
                          new Date(incident.startedAt).getTime(),
                      )}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
