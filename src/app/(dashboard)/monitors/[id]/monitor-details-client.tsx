"use client";

import { ChevronLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { CheckHistory } from "@/features/checks/components/check-history";
import type { ChecksData, Incident } from "@/features/checks/types";
import {
	MonitorConfigForm,
	type MonitorDetails,
	type ProjectOption,
} from "./monitor-config-form";

type MonitorDetailsClientProps = {
	initialMonitor: MonitorDetails;
	projects: ProjectOption[];
	initialData: ChecksData;
	incidents: Incident[];
	now: number;
};

export default function MonitorDetailsClient({
	initialMonitor,
	projects,
	initialData,
	incidents,
	now,
}: MonitorDetailsClientProps) {
	const router = useRouter();
	const [monitor, setMonitor] = useState(initialMonitor);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	async function handleDelete() {
		setDeleting(true);
		setDeleteError(null);

		try {
			const response = await fetch(`/api/monitors/${monitor.id}`, {
				method: "DELETE",
			});

			const data: { error?: string } = await response.json();

			if (!response.ok) {
				throw new Error(data.error ?? "Unable to delete this monitor.");
			}

			router.push("/monitors");
			router.refresh();
		} catch (cause) {
			setDeleteError(
				cause instanceof Error
					? cause.message
					: "Something went wrong while deleting this monitor.",
			);
			setDeleting(false);
		}
	}

	return (
		<>
			<PageHeader
				back={
					<Link
						href="/monitors"
						className="inline-flex items-center gap-1 hover:text-fg"
					>
						<ChevronLeft aria-hidden="true" className="size-4" />
						Monitors
					</Link>
				}
				title={monitor.name}
				description={monitor.url}
				actions={
					<Button variant="danger" onClick={() => setConfirmOpen(true)}>
						<Trash2 aria-hidden="true" className="size-4" />
						Delete
					</Button>
				}
			/>

			<CheckHistory
				monitorId={monitor.id}
				initialData={initialData}
				initialNow={now}
				incidents={incidents}
				configuration={(reload) => (
					<MonitorConfigForm
						monitor={monitor}
						projects={projects}
						disabled={deleting}
						onSaved={(saved) => {
							setMonitor((current) => ({ ...current, ...saved }));
							reload();
						}}
					/>
				)}
			/>

			<ConfirmDialog
				open={confirmOpen}
				title={`Delete ${monitor.name}?`}
				description="Checks stop and the monitor is removed from your lists and statistics."
				confirmLabel="Delete monitor"
				destructive
				loading={deleting}
				error={deleteError}
				onCancel={() => setConfirmOpen(false)}
				onConfirm={handleDelete}
			/>
		</>
	);
}
