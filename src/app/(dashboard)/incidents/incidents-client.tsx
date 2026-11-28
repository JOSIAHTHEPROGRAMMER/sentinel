"use client";

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Column, DataTable, RowLink } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Figure } from "@/components/ui/figure";
import { LocalDate } from "@/components/ui/local-date";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import {
  DEFAULT_INCIDENT_FILTERS,
  INCIDENT_RANGES,
  INCIDENT_STATUSES,
  type IncidentFilters,
  type IncidentRange,
  type IncidentStats,
  type IncidentStatus,
} from "@/lib/data/incidents-shared";
import { formatDurationMs } from "@/lib/format-duration";

type Incident = {
  id: string;
  monitorId: string;
  monitorName: string;
  monitorUrl: string;
  projectName: string | null;
  startedAt: string;
  resolvedAt: string | null;
  reason: string;
};

type Option = {
  id: string;
  name: string;
};

type IncidentsClientProps = {
  incidents: Incident[];
  stats: IncidentStats;
  filters: IncidentFilters;
  monitorOptions: Option[];
  projectOptions: Option[];
  initialNow: number;
};

const RANGE_LABELS: Record<IncidentRange, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

const STATUS_LABELS: Record<IncidentStatus, string> = {
  all: "All",
  open: "Open",
  resolved: "Resolved",
};

function formatDuration(
  startedAt: string,
  resolvedAt: string | null,
  now: number,
): string {
  const start = new Date(startedAt).getTime();

  if (Number.isNaN(start)) {
    return "Unknown";
  }

  const end = resolvedAt ? new Date(resolvedAt).getTime() : now;

  if (!Number.isFinite(end) || end < start) {
    return "Unknown";
  }

  return formatDurationMs(end - start);
}

function buildUrl(filters: IncidentFilters): string {
  const params = new URLSearchParams();

  if (filters.status !== DEFAULT_INCIDENT_FILTERS.status) {
    params.set("status", filters.status);
  }

  if (filters.range !== DEFAULT_INCIDENT_FILTERS.range) {
    params.set("range", filters.range);
  }

  if (filters.monitorId) {
    params.set("monitor", filters.monitorId);
  }

  if (filters.projectId) {
    params.set("project", filters.projectId);
  }

  const query = params.toString();

  return query ? `/incidents?${query}` : "/incidents";
}

export default function IncidentsClient({
  incidents,
  stats,
  filters,
  monitorOptions,
  projectOptions,
  initialNow,
}: IncidentsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  function applyFilters(changes: Partial<IncidentFilters>) {
    startTransition(() => {
      router.push(buildUrl({ ...filters, ...changes }), { scroll: false });
    });
  }

  const matchingCount =
    filters.status === "open"
      ? stats.open
      : filters.status === "resolved"
        ? stats.resolved
        : stats.total;

  const hasFilters =
    filters.status !== DEFAULT_INCIDENT_FILTERS.status ||
    filters.range !== DEFAULT_INCIDENT_FILTERS.range ||
    filters.monitorId !== null ||
    filters.projectId !== null;

  const columns: Column<Incident>[] = [
    {
      key: "status",
      header: "Status",
      cell: (incident) =>
        incident.resolvedAt === null ? (
          <Badge tone="danger">Open</Badge>
        ) : (
          <Badge tone="success">Resolved</Badge>
        ),
    },
    {
      key: "monitor",
      header: "Monitor",
      cell: (incident) => (
        <div className="min-w-0 max-w-xs">
          <RowLink href={`/incidents/${incident.id}`}>
            {incident.monitorName}
          </RowLink>
          <p className="truncate font-mono text-xs text-fg-subtle">
            {incident.monitorUrl}
          </p>
        </div>
      ),
    },
    {
      key: "project",
      header: "Project",
      cell: (incident) => (
        <span className="text-fg-muted">
          {incident.projectName ?? "Standalone"}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      cell: (incident) => (
        <span className="block max-w-xs wrap-break-word text-fg-muted">
          {incident.reason}
        </span>
      ),
    },
    {
      key: "started",
      header: "Started",
      className: "whitespace-nowrap",
      cell: (incident) => <LocalDate value={incident.startedAt} />,
    },
    {
      key: "duration",
      header: "Duration",
      align: "right",
      className: "whitespace-nowrap",
      cell: (incident) =>
        `${formatDuration(incident.startedAt, incident.resolvedAt, now)}${incident.resolvedAt ? "" : " so far"}`,
    },
    {
      key: "resolved",
      header: "Resolved",
      className: "whitespace-nowrap",
      cell: (incident) =>
        incident.resolvedAt ? <LocalDate value={incident.resolvedAt} /> : "N/A",
    },
  ];

  return (
    <>
      <PageHeader title="Incidents" />

      <Panel
        title="Summary"
        description={RANGE_LABELS[filters.range]}
        className={cn("transition-opacity", isPending && "opacity-60")}
      >
        <div className="grid gap-6 sm:grid-cols-3">
          <Figure
            label="Incidents"
            value={String(stats.total)}
            detail={`${stats.open} open, ${stats.resolved} resolved`}
          />
          <Figure
            label="Average time to resolution"
            value={
              stats.averageResolutionMs === null
                ? "N/A"
                : formatDurationMs(stats.averageResolutionMs)
            }
            detail="Resolved incidents only"
          />
          <Figure
            label="Frequency"
            value={stats.perDay === null ? "N/A" : `${stats.perDay} / day`}
            detail={
              stats.perDay === null
                ? "Choose a time range to see frequency"
                : "Incidents started per day"
            }
          />
        </div>
      </Panel>

      <Panel title="Filters">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <p className="text-ui font-medium text-fg">Status</p>
            <SegmentedControl
              label="Status"
              value={filters.status}
              onChange={(value) =>
                applyFilters({ status: value as IncidentStatus })
              }
              options={INCIDENT_STATUSES.map((value) => ({
                value,
                label: STATUS_LABELS[value],
              }))}
            />
          </div>

          <Field label="Period" className="w-44">
            {(control) => (
              <Select
                id={control.id}
                value={filters.range}
                onChange={(value) =>
                  applyFilters({ range: value as IncidentRange })
                }
                options={INCIDENT_RANGES.map((range) => ({
                  value: range,
                  label: RANGE_LABELS[range],
                }))}
              />
            )}
          </Field>

          <Field label="Monitor" className="w-52">
            {(control) => (
              <Select
                id={control.id}
                value={filters.monitorId ?? ""}
                onChange={(value) => applyFilters({ monitorId: value || null })}
                options={[
                  { value: "", label: "All monitors" },
                  ...monitorOptions.map((option) => ({
                    value: option.id,
                    label: option.name,
                  })),
                ]}
              />
            )}
          </Field>

          <Field label="Project" className="w-52">
            {(control) => (
              <Select
                id={control.id}
                value={filters.projectId ?? ""}
                onChange={(value) => applyFilters({ projectId: value || null })}
                options={[
                  { value: "", label: "All projects" },
                  ...projectOptions.map((option) => ({
                    value: option.id,
                    label: option.name,
                  })),
                ]}
              />
            )}
          </Field>

          {hasFilters && (
            <Button
              variant="quiet"
              onClick={() =>
                startTransition(() => {
                  router.push("/incidents", { scroll: false });
                })
              }
            >
              Reset filters
            </Button>
          )}
        </div>
      </Panel>

      <Panel
        title="Incident history"
        description="Outages detected by your monitors"
        flush
        className={cn("transition-opacity", isPending && "opacity-60")}
      >
        {incidents.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title={
              hasFilters
                ? "No incidents match these filters"
                : "No incidents yet"
            }
            description={
              hasFilters
                ? "Try a longer period or reset the filters."
                : "When a monitor fails, Sentinel records the incident here."
            }
          />
        ) : (
          <DataTable
            interactive
            caption="Incidents"
            columns={columns}
            rows={incidents}
            rowKey={(incident) => incident.id}
          />
        )}

        {matchingCount > incidents.length && (
          <p className="border-t border-border px-4 py-3 text-ui text-fg-subtle">
            Showing the {incidents.length} most recent of {matchingCount}{" "}
            incidents. Narrow the period or filters to see others.
          </p>
        )}
      </Panel>
    </>
  );
}
