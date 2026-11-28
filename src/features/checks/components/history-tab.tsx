import { Activity } from "lucide-react";
import { CheckStatusBadge } from "@/components/ui/check-status-badge";
import { type Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalDate } from "@/components/ui/local-date";
import { Panel } from "@/components/ui/panel";
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

export function HistoryTab({ checks }: { checks: CheckResult[] }) {
	return (
		<Panel title="Check history" description="The 50 most recent results" flush>
			{checks.length === 0 ? (
				<EmptyState
					icon={Activity}
					title="No checks recorded yet"
					description="Results appear here after the monitoring worker runs a check."
				/>
			) : (
				<DataTable
					caption="Most recent checks"
					columns={columns}
					rows={checks}
					rowKey={(check) => check.id}
				/>
			)}
		</Panel>
	);
}
