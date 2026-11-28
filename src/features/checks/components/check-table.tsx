import { CheckStatusBadge } from "@/components/ui/check-status-badge";
import { type Column, DataTable } from "@/components/ui/data-table";
import { LocalDate } from "@/components/ui/local-date";
import type { CheckResult } from "../types";

const columns: Column<CheckResult>[] = [
  {
    key: "checkedAt",
    header: "Checked at",
    className: "whitespace-nowrap",
    cell: (check) => <LocalDate value={check.checkedAt} />,
  },
  {
    key: "status",
    header: "Status",
    cell: (check) => (
      <div>
        <CheckStatusBadge status={check.status} />
        {check.errorMessage && (
          <p className="mt-1 max-w-xs wrap-break-word font-mono text-xs text-danger">
            {check.errorMessage}
          </p>
        )}
      </div>
    ),
  },
  {
    key: "http",
    header: "HTTP",
    align: "right",
    cell: (check) => (
      <span className="font-mono">{check.httpStatus ?? "N/A"}</span>
    ),
  },
  {
    key: "latency",
    header: "Response time",
    align: "right",
    cell: (check) =>
      check.latencyMs === null ? "N/A" : `${check.latencyMs} ms`,
  },
];

export function CheckTable({
  checks,
  caption,
}: {
  checks: CheckResult[];
  caption: string;
}) {
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={checks}
      rowKey={(check) => check.id}
    />
  );
}
