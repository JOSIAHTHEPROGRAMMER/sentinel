"use client";

import { Server } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, tabPanelProps } from "@/components/ui/tabs";
import { formatInterval } from "@/lib/format-interval";

type Row = {
	id: string;
	name: string;
	url: string;
	status: "up" | "down" | "degraded" | "paused";
	uptime: string;
	interval: number;
};

const rows: Row[] = [
	{
		id: "1",
		name: "Production API",
		url: "https://api.example.com/health",
		status: "down",
		uptime: "97.12%",
		interval: 60,
	},
	{
		id: "2",
		name: "Checkout",
		url: "https://example.com/checkout",
		status: "degraded",
		uptime: "99.40%",
		interval: 300,
	},
	{
		id: "3",
		name: "Docs site",
		url: "https://docs.example.com",
		status: "up",
		uptime: "100.00%",
		interval: 3600,
	},
	{
		id: "4",
		name: "Legacy API",
		url: "https://legacy.example.com",
		status: "paused",
		uptime: "N/A",
		interval: 900,
	},
];

const statusBadge = {
	up: <Badge tone="success">Operational</Badge>,
	down: <Badge tone="danger">Down</Badge>,
	degraded: <Badge tone="warning">Degraded</Badge>,
	paused: <Badge tone="neutral">Paused</Badge>,
};

const columns: Column<Row>[] = [
	{ key: "status", header: "Status", cell: (row) => statusBadge[row.status] },
	{
		key: "name",
		header: "Monitor",
		cell: (row) => (
			<div className="min-w-0">
				<p className="font-medium">{row.name}</p>
				<p className="truncate font-mono text-xs text-fg-subtle">{row.url}</p>
			</div>
		),
	},
	{
		key: "uptime",
		header: "Uptime (24h)",
		align: "right",
		cell: (row) => row.uptime,
	},
	{
		key: "interval",
		header: "Interval",
		align: "right",
		cell: (row) => formatInterval(row.interval),
	},
];

const projectOptions = [
	{ value: "", label: "All projects" },
	{ value: "standalone", label: "Standalone" },
	{ value: "web", label: "Website" },
	{ value: "internal", label: "Internal tools" },
	{ value: "archived", label: "Archived", disabled: true },
];

export function DesignClient() {
	const [project, setProject] = useState("");
	const [tab, setTab] = useState("overview");
	const [modalOpen, setModalOpen] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [name, setName] = useState("");

	return (
		<main className="mx-auto max-w-5xl space-y-8 p-6">
			<PageHeader
				title="Component preview"
				description="Temporary page. Check every component in dark and light."
				actions={
					<>
						<Button variant="secondary">Refresh</Button>
						<Button variant="primary">Add monitor</Button>
					</>
				}
			/>

			<Panel title="Buttons and badges">
				<div className="flex flex-wrap items-center gap-3">
					<Button variant="primary">Primary</Button>
					<Button variant="secondary">Secondary</Button>
					<Button variant="quiet">Quiet</Button>
					<Button variant="danger">Delete monitor</Button>
					<Button variant="primary" loading>
						Saving
					</Button>
					<Button variant="secondary" disabled>
						Disabled
					</Button>
					<Button size="sm">Small</Button>
				</div>
				<div className="mt-4 flex flex-wrap gap-3">
					{statusBadge.up}
					{statusBadge.down}
					{statusBadge.degraded}
					{statusBadge.paused}
				</div>
			</Panel>

			<Panel title="Form controls">
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Name" hint="Shown in lists and incidents." required>
						{(control) => (
							<Input
								{...control}
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Production API"
							/>
						)}
					</Field>
					<Field label="URL" error="Enter a valid public URL.">
						{(control) => <Input {...control} defaultValue="http://" />}
					</Field>
					<Field label="Project">
						{(control) => (
							<Select
								id={control.id}
								aria-describedby={control["aria-describedby"]}
								options={projectOptions}
								value={project}
								onChange={setProject}
							/>
						)}
					</Field>
					<Field label="Notes">
						{(control) => <Textarea {...control} placeholder="Optional" />}
					</Field>
				</div>
			</Panel>

			<Panel
				title="Monitors"
				description="Table with status, links and mono URLs"
				flush
			>
				<DataTable
					caption="Example monitors"
					columns={columns}
					rows={rows}
					rowKey={(row) => row.id}
				/>
			</Panel>

			<Panel title="Tabs">
				<Tabs
					idPrefix="design"
					label="Example sections"
					value={tab}
					onChange={setTab}
					tabs={[
						{ id: "overview", label: "Overview" },
						{ id: "incidents", label: "Incidents", count: 3 },
						{ id: "settings", label: "Configuration" },
					]}
				/>
				<div
					{...tabPanelProps("design", tab)}
					className="pt-4 text-sm text-fg-muted"
				>
					Panel for {tab}.
				</div>
			</Panel>

			<div className="grid gap-4 sm:grid-cols-2">
				<Panel title="Empty state" flush>
					<EmptyState
						icon={Server}
						title="No monitors yet"
						description="Add an endpoint to start recording checks."
						action={<Button variant="primary">Add monitor</Button>}
					/>
				</Panel>
				<Panel title="Loading skeleton">
					<div className="space-y-3" aria-busy="true">
						<Skeleton className="h-4 w-1/3" />
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-2/3" />
					</div>
				</Panel>
			</div>

			<Panel title="Dialogs">
				<div className="flex flex-wrap gap-3">
					<Button onClick={() => setModalOpen(true)}>Open modal</Button>
					<Button variant="danger" onClick={() => setConfirmOpen(true)}>
						Delete monitor
					</Button>
				</div>
			</Panel>

			<Modal
				open={modalOpen}
				onClose={() => setModalOpen(false)}
				title="Edit monitor"
				description="Escape, the close button and a click outside all close this."
				footer={
					<>
						<Button onClick={() => setModalOpen(false)}>Cancel</Button>
						<Button variant="primary" onClick={() => setModalOpen(false)}>
							Save
						</Button>
					</>
				}
			>
				<Field label="Project">
					{(control) => (
						<Select
							id={control.id}
							options={projectOptions}
							value={project}
							onChange={setProject}
						/>
					)}
				</Field>
			</Modal>

			<ConfirmDialog
				open={confirmOpen}
				title="Delete Production API?"
				description="The monitor stops running and disappears from your lists. Its history is no longer shown."
				confirmLabel="Delete monitor"
				destructive
				onCancel={() => setConfirmOpen(false)}
				onConfirm={() => setConfirmOpen(false)}
			/>
		</main>
	);
}
