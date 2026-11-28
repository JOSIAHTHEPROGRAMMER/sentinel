import { CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type Column, DataTable, RowLink } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalDate } from "@/components/ui/local-date";
import { Panel } from "@/components/ui/panel";
import { formatDurationMs } from "@/lib/format-duration";
import type { Incident } from "../types";

export function IncidentsTab({
  incidents,
  now,
}: {
  incidents: Incident[];
  now: number;
}) {
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
      key: "started",
      header: "Started",
      className: "whitespace-nowrap",
      cell: (incident) => (
        <RowLink href={`/incidents/${incident.id}`} className="font-normal">
          <LocalDate value={incident.startedAt} />
        </RowLink>
      ),
    },
    {
      key: "resolved",
      header: "Resolved",
      className: "whitespace-nowrap",
      cell: (incident) =>
        incident.resolvedAt ? <LocalDate value={incident.resolvedAt} /> : "N/A",
    },
    {
      key: "duration",
      header: "Duration",
      className: "whitespace-nowrap",
      cell: (incident) => {
        const end = incident.resolvedAt
          ? new Date(incident.resolvedAt).getTime()
          : now;

        return `${formatDurationMs(end - new Date(incident.startedAt).getTime())}${incident.resolvedAt ? "" : " so far"}`;
      },
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
  ];

  return (
    <Panel
      title="Incidents"
      description="The 50 most recent incidents for this monitor"
      flush
    >
      {incidents.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="No incidents recorded"
          description="An incident opens when checks fail and resolves when later checks succeed."
        />
      ) : (
        <DataTable
          interactive
          caption="Incidents for this monitor"
          columns={columns}
          rows={incidents}
          rowKey={(incident) => incident.id}
        />
      )}
    </Panel>
  );
}
