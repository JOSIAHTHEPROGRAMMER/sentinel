"use client";

import { Activity, ChevronLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { type Column, DataTable, RowLink } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Figure } from "@/components/ui/figure";
import { LocalDate } from "@/components/ui/local-date";
import { ConfirmDialog } from "@/components/ui/modal";
import { MonitorStatusBadge } from "@/components/ui/monitor-status-badge";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import type { MonitorRow } from "@/lib/data/monitor-rows";
import { formatDurationMs } from "@/lib/format-duration";
import { formatInterval } from "@/lib/format-interval";

type Project = {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
};

export type ProjectMonitorRow = MonitorRow & {
	openIncident: { startedAt: string; reason: string } | null;
};

type ProjectCounts = {
	monitors: number;
	enabled: number;
	disabled: number;
	openIncidents: number;
};

type ProjectHealth = {
	totalChecks: number;
	successfulChecks: number;
	uptimePercentage: number | null;
	averageResponseTime: number | null;
};

type ProjectDetailsClientProps = {
	project: Project;
	rows: ProjectMonitorRow[];
	counts: ProjectCounts;
	health: ProjectHealth;
	now: number;
};

export default function ProjectDetailsClient({
	project,
	rows,
	counts,
	health,
	now,
}: ProjectDetailsClientProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [name, setName] = useState(project.name);
	const [saving, setSaving] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState("");
	const [deleteError, setDeleteError] = useState<string | null>(null);

	function refresh() {
		startTransition(() => {
			router.refresh();
		});
	}

	async function saveProject() {
		const trimmedName = name.trim();

		if (!trimmedName) {
			setError("Project name is required.");
			return;
		}

		setSaving(true);
		setError("");

		try {
			const response = await fetch(`/api/projects/${project.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: trimmedName }),
			});
			const data: { project?: Project; error?: string } = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to update project.");
			}

			if (data.project) {
				setName(data.project.name);
			}

			refresh();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to update project.",
			);
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete() {
		setDeleting(true);
		setDeleteError(null);

		try {
			const response = await fetch(`/api/projects/${project.id}`, {
				method: "DELETE",
			});
			const data: { error?: string } = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to delete project.");
			}

			router.push("/projects");
			router.refresh();
		} catch (err) {
			setDeleteError(
				err instanceof Error ? err.message : "Failed to delete project.",
			);
			setDeleting(false);
		}
	}

	const columns: Column<ProjectMonitorRow>[] = [
		{
			key: "status",
			header: "Status",
			cell: (row) => (
				<div>
					<MonitorStatusBadge status={row.status} />
				</div>
			),
		},
		{
			key: "monitor",
			header: "Monitor",
			cell: (row) => (
				<div className="min-w-0 max-w-sm">
					<RowLink href={`/monitors/${row.id}`}>{row.name}</RowLink>
					<p className="truncate font-mono text-xs text-fg-subtle">{row.url}</p>
					{row.openIncident && (
						<p className="mt-1 wrap-break-word text-ui text-danger">
							Open incident since{" "}
							<LocalDate value={row.openIncident.startedAt} />:{" "}
							{row.openIncident.reason}
						</p>
					)}
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
				back={
					<Link
						href="/projects"
						className="inline-flex items-center gap-1 hover:text-fg"
					>
						<ChevronLeft aria-hidden="true" className="size-4" />
						Projects
					</Link>
				}
				title={project.name}
				actions={
					<>
						<Button variant="secondary" onClick={refresh} loading={isPending}>
							Refresh
						</Button>
						<Button variant="danger" onClick={() => setConfirmOpen(true)}>
							<Trash2 aria-hidden="true" className="size-4" />
							Delete
						</Button>
					</>
				}
			/>

			<Panel
				title="Last 24 hours"
				actions={
					<Link
						href={`/incidents?project=${project.id}&range=all`}
						className={buttonStyles({ variant: "quiet", size: "sm" })}
					>
						Incident history
					</Link>
				}
				className={cn("transition-opacity", isPending && "opacity-60")}
			>
				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
					<Figure
						label="Monitors"
						value={String(counts.monitors)}
						detail={`${counts.enabled} active, ${counts.disabled} paused`}
					/>
					<Figure
						label="Open incidents"
						value={String(counts.openIncidents)}
						detail={
							counts.openIncidents > 0
								? "Listed first below"
								: "Nothing needs attention"
						}
					/>
					<Figure
						label="Uptime"
						value={
							health.uptimePercentage === null
								? "N/A"
								: `${health.uptimePercentage.toFixed(2)}%`
						}
						detail={`${health.totalChecks.toLocaleString("en-US")} checks`}
					/>
					<Figure
						label="Average response time"
						value={
							health.averageResponseTime === null
								? "N/A"
								: `${health.averageResponseTime} ms`
						}
						detail="Successful checks only"
					/>
				</div>
			</Panel>

			<Panel
				title="Monitors"
				description="Monitors with problems are listed first"
				actions={
					rows.length > 0 ? (
						<Link
							href={`/monitors?project=${project.id}`}
							className={buttonStyles({ variant: "quiet", size: "sm" })}
						>
							View in monitors list
						</Link>
					) : undefined
				}
				flush
				className={cn("transition-opacity", isPending && "opacity-60")}
			>
				{rows.length === 0 ? (
					<EmptyState
						icon={Activity}
						title="No monitors assigned"
						description="Assign a monitor from its configuration, or create one and choose this project."
						action={
							<Link
								href="/monitors/new"
								className={buttonStyles({ variant: "primary" })}
							>
								Add monitor
							</Link>
						}
					/>
				) : (
					<DataTable
						interactive
						caption="Monitors in this project"
						columns={columns}
						rows={rows}
						rowKey={(row) => row.id}
					/>
				)}
			</Panel>

			<Panel title="Project settings">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void saveProject();
					}}
					className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
				>
					<Field label="Project name" className="min-w-0 flex-1">
						{(control) => (
							<Input
								{...control}
								value={name}
								maxLength={100}
								onChange={(event) => setName(event.target.value)}
							/>
						)}
					</Field>
					<Button
						type="submit"
						variant="primary"
						loading={saving}
						disabled={deleting || !name.trim() || name.trim() === project.name}
					>
						Save changes
					</Button>
				</form>
				{error && (
					<Notice tone="danger" className="mt-3 max-w-xl">
						{error}
					</Notice>
				)}
			</Panel>

			<ConfirmDialog
				open={confirmOpen}
				title={`Delete ${project.name}?`}
				description="Its monitors become standalone and keep their check history. The project itself is removed."
				confirmLabel="Delete project"
				destructive
				loading={deleting}
				error={deleteError}
				onCancel={() => setConfirmOpen(false)}
				onConfirm={() => void handleDelete()}
			/>
		</>
	);
}
