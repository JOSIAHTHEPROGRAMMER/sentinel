"use client";

import { Activity, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { type Column, DataTable, RowLink } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { MonitorStatusBadge } from "@/components/ui/monitor-status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { MonitorRow } from "@/lib/data/monitor-rows";
import { formatDurationMs } from "@/lib/format-duration";
import { formatInterval } from "@/lib/format-interval";

type Project = {
  id: string;
  name: string;
};

type MonitorsClientProps = {
  rows: MonitorRow[];
  projects: Project[];
  projectFilter: string | undefined;
  now: number;
};

const STANDALONE = "standalone";

export default function MonitorsClient({
  rows,
  projects,
  projectFilter,
  now,
}: MonitorsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const projectNames = new Map(
    projects.map((project) => [project.id, project.name]),
  );

  // An unknown or stale filter value (for example a deleted project) is ignored
  const activeFilter =
    projectFilter === STANDALONE || projectNames.has(projectFilter ?? "")
      ? projectFilter
      : undefined;

  const filtered = rows.filter((row) => {
    if (activeFilter === undefined) {
      return true;
    }

    if (activeFilter === STANDALONE) {
      return row.projectId === null;
    }

    return row.projectId === activeFilter;
  });

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  function changeFilter(value: string) {
    startTransition(() => {
      router.push(value === "" ? "/monitors" : `/monitors?project=${value}`, {
        scroll: false,
      });
    });
  }

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
      key: "project",
      header: "Project",
      cell: (row) => (
        <span className="text-fg-muted">
          {row.projectId
            ? (projectNames.get(row.projectId) ?? "Unknown project")
            : "Standalone"}
        </span>
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
        title="Monitors"
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

      <Panel
        title="All monitors"
        description={
          activeFilter === undefined
            ? `${rows.length} ${rows.length === 1 ? "monitor" : "monitors"}, problems first`
            : `${filtered.length} of ${rows.length} shown`
        }
        actions={
          rows.length > 0 ? (
            <Select
              aria-label="Filter by project"
              className="w-48"
              value={activeFilter ?? ""}
              onChange={changeFilter}
              options={[
                { value: "", label: "All projects" },
                { value: STANDALONE, label: "Standalone" },
                ...projects.map((project) => ({
                  value: project.id,
                  label: project.name,
                })),
              ]}
            />
          ) : undefined
        }
        flush
        className={cn("transition-opacity", isPending && "opacity-60")}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No monitors configured"
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
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No monitors match this filter"
            action={
              <Button variant="secondary" onClick={() => changeFilter("")}>
                Show all projects
              </Button>
            }
          />
        ) : (
          <DataTable
            interactive
            caption="Monitors and their current status"
            columns={columns}
            rows={filtered}
            rowKey={(row) => row.id}
          />
        )}
      </Panel>
    </>
  );
}
