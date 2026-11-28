import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Column<Row> = {
	key: string;
	header: string;
	cell: (row: Row) => ReactNode;
	align?: "left" | "right";
	// Hides the visible header text but keeps it for screen readers
	hideHeader?: boolean;
	className?: string;
};

type DataTableProps<Row> = {
	columns: Column<Row>[];
	rows: Row[];
	rowKey: (row: Row) => string;
	caption: string;
};

export function DataTable<Row>({
	columns,
	rows,
	rowKey,
	caption,
}: DataTableProps<Row>) {
	return (
		<div className="table-scroll overflow-x-auto">
			<table className="w-full min-w-160 text-left text-sm">
				<caption className="sr-only">{caption}</caption>
				<thead>
					<tr className="border-b border-border">
						{columns.map((column) => (
							<th
								key={column.key}
								scope="col"
								className={cn(
									"h-9 px-4 text-xs font-medium whitespace-nowrap text-fg-subtle",
									column.align === "right" && "text-right",
									column.className,
								)}
							>
								<span className={cn(column.hideHeader && "sr-only")}>
									{column.header}
								</span>
							</th>
						))}
					</tr>
				</thead>
				<tbody className="divide-y divide-border">
					{rows.map((row) => (
						<tr key={rowKey(row)} className="hover:bg-raised">
							{columns.map((column) => (
								<td
									key={column.key}
									className={cn(
										"px-4 py-2.5 align-middle text-fg tabular-nums",
										column.align === "right" && "text-right",
										column.className,
									)}
								>
									{column.cell(row)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
