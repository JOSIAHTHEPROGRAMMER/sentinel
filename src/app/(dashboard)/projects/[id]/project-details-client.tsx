"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Project = {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
};

type Monitor = {
	id: string;
	name: string;
	url: string;
	enabled: boolean;
};

type ProjectHealth = {
	totalChecks: number;
	successfulChecks: number;
	uptimePercentage: number | null;
	averageResponseTime: number | null;
};

type ProjectDetailsClientProps = {
	project: Project;
	monitors: Monitor[];
	health: ProjectHealth;
};

export default function ProjectDetailsClient({
	project,
	monitors,
	health,
}: ProjectDetailsClientProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [name, setName] = useState(project.name);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState("");

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
		if (
			!window.confirm(
				"Delete this project? Its monitors will become standalone.",
			)
		) {
			return;
		}

		setDeleting(true);
		setError("");

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
			setError(
				err instanceof Error ? err.message : "Failed to delete project.",
			);
			setDeleting(false);
		}
	}

	return (
		<div className="space-y-8">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<Link
						href="/projects"
						className="text-sm text-slate-400 hover:text-white"
					>
						Projects
					</Link>
					<h1 className="mt-2 text-2xl font-semibold text-white">
						{project.name}
					</h1>
				</div>
				<button
					type="button"
					onClick={refresh}
					disabled={isPending}
					className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
				>
					{isPending ? "Refreshing..." : "Refresh"}
				</button>
			</div>

			{error && (
				<p
					role="alert"
					className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
				>
					{error}
				</p>
			)}

			<section
				className={`grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-4 ${
					isPending ? "opacity-60" : ""
				}`}
			>
				<div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
					<p className="text-sm text-slate-400">Assigned monitors</p>
					<p className="mt-2 text-2xl font-semibold text-white">
						{monitors.length}
					</p>
				</div>
				<div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
					<p className="text-sm text-slate-400">24h uptime</p>
					<p className="mt-2 text-2xl font-semibold text-white">
						{health.uptimePercentage === null
							? "N/A"
							: `${health.uptimePercentage.toFixed(2)}%`}
					</p>
				</div>
				<div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
					<p className="text-sm text-slate-400">Average response</p>
					<p className="mt-2 text-2xl font-semibold text-white">
						{health.averageResponseTime === null
							? "N/A"
							: `${health.averageResponseTime} ms`}
					</p>
					<p className="mt-1 text-xs text-slate-500">Successful checks only</p>
				</div>
				<div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
					<p className="text-sm text-slate-400">Checks in 24h</p>
					<p className="mt-2 text-2xl font-semibold text-white">
						{health.totalChecks}
					</p>
				</div>
			</section>

			<section className="space-y-4">
				<div>
					<h2 className="text-lg font-semibold text-white">Monitors</h2>
					<p className="mt-1 text-sm text-slate-400">
						Endpoints assigned to this project.
					</p>
				</div>

				{monitors.length === 0 ? (
					<div className="rounded-xl border border-dashed border-slate-700 px-6 py-10 text-center">
						<p className="font-medium text-white">No monitors assigned</p>
						<p className="mt-2 text-sm text-slate-400">
							Assign a monitor from its settings or create one for this project.
						</p>
						<Link
							href="/monitors"
							className="mt-4 inline-block text-sm text-cyan-400 hover:text-cyan-300"
						>
							View monitors
						</Link>
					</div>
				) : (
					<div className="overflow-hidden rounded-xl border border-slate-800">
						{monitors.map((monitor) => (
							<Link
								key={monitor.id}
								href={`/monitors/${monitor.id}`}
								className="flex flex-col gap-2 border-b border-slate-800 bg-slate-900/40 px-5 py-4 transition last:border-b-0 hover:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"
							>
								<div>
									<p className="font-medium text-white">{monitor.name}</p>
									<p className="mt-1 break-all text-sm text-slate-400">
										{monitor.url}
									</p>
								</div>
								<span
									className={`text-xs ${
										monitor.enabled ? "text-emerald-400" : "text-slate-500"
									}`}
								>
									{monitor.enabled ? "Enabled" : "Disabled"}
								</span>
							</Link>
						))}
					</div>
				)}
			</section>

			<section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
				<div>
					<h2 className="font-semibold text-white">Project settings</h2>
					<p className="mt-1 text-sm text-slate-400">
						Update the project name or delete this project.
					</p>
				</div>

				<form
					onSubmit={(event) => {
						event.preventDefault();
						void saveProject();
					}}
					className="flex flex-col gap-3 sm:flex-row"
				>
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						maxLength={100}
						aria-label="Project name"
						className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
					/>
					<button
						type="submit"
						disabled={
							saving || deleting || !name.trim() || name.trim() === project.name
						}
						className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{saving ? "Saving..." : "Save changes"}
					</button>
				</form>

				<div className="flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="text-sm font-medium text-white">Delete project</p>
						<p className="mt-1 text-xs text-slate-400">
							Monitors will be unassigned. Their check history will be
							preserved.
						</p>
					</div>
					<button
						type="button"
						onClick={() => void handleDelete()}
						disabled={saving || deleting}
						className="rounded-lg border border-red-900/60 px-4 py-2 text-sm text-red-300 transition hover:bg-red-950/40 disabled:opacity-50"
					>
						{deleting ? "Deleting..." : "Delete project"}
					</button>
				</div>
			</section>
		</div>
	);
}
