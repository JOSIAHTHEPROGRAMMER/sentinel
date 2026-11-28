import Link from "next/link";
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
	// Rows navigate when clicked. One cell per row must render a RowLink.
	interactive?: boolean;
};

export function DataTable<Row>({
	columns,
	rows,
	rowKey,
	caption,
	interactive = false,
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
						<tr
							key={rowKey(row)}
							className={cn(
								"hover:bg-raised",
								interactive && "relative cursor-pointer focus-within:bg-raised",
							)}
						>
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

// The link that makes its whole table row clickable. Its pseudo-element
// stretches to the row, which must be the nearest positioned ancestor, so
// this link itself must not be positioned.
export function RowLink({
	href,
	children,
	className,
}: {
	href: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<Link
			href={href}
			className={cn(
				"font-medium text-fg after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:-outline-offset-2 focus-visible:after:outline-2 focus-visible:after:outline-ring",
				className,
			)}
		>
			{children}
		</Link>
	);
}
