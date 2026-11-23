"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Project = {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	monitorCount: number;
	enabledCount: number;
	disabledCount: number;
	openIncidents: number;
	health: {
		totalChecks: number;
		successfulChecks: number;
		uptimePercentage: number | null;
		averageResponseTime: number | null;
	};
};

type ProjectsClientProps = {
	projects: Project[];
};

export default function ProjectsClient({ projects }: ProjectsClientProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [name, setName] = useState("");
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState("");

	function refresh() {
		startTransition(() => {
			router.refresh();
		});
	}

	async function createProject() {
		const trimmedName = name.trim();

		if (!trimmedName) {
			setError("Project name is required.");
			return;
		}

		setCreating(true);
		setError("");

		try {
			const response = await fetch("/api/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: trimmedName }),
			});
			const data: { error?: string } = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to create project.");
			}

			setName("");
			refresh();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to create project.",
			);
		} finally {
			setCreating(false);
		}
	}

	return (
		<div className="space-y-8">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-white">Projects</h1>
					<p className="mt-1 text-sm text-slate-400">
						Group and monitor related endpoints.
					</p>
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

			<form
				onSubmit={(event) => {
					event.preventDefault();
					void createProject();
				}}
				className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-5 sm:flex-row"
			>
				<input
					value={name}
					onChange={(event) => setName(event.target.value)}
					maxLength={100}
					placeholder="Project name"
					aria-label="Project name"
					className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500"
				/>
				<button
					type="submit"
					disabled={creating || !name.trim()}
					className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{creating ? "Creating..." : "Create project"}
				</button>
			</form>

			{error && (
				<p
					role="alert"
					className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300"
				>
					{error}
				</p>
			)}

			{projects.length === 0 ? (
				<div className="rounded-xl border border-dashed border-slate-700 px-6 py-12 text-center">
					<h2 className="font-medium text-white">No projects yet</h2>
					<p className="mt-2 text-sm text-slate-400">
						Create a project to organize your monitors.
					</p>
				</div>
			) : (
				<div
					className={`grid gap-4 transition-opacity md:grid-cols-2 xl:grid-cols-3 ${
						isPending ? "opacity-60" : ""
					}`}
				>
					{projects.map((project) => (
						<Link
							key={project.id}
							href={`/projects/${project.id}`}
							className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition hover:border-cyan-500/50 hover:bg-slate-900"
						>
							<div className="flex items-start justify-between gap-3">
								<h2 className="font-medium text-white">{project.name}</h2>
								{project.openIncidents > 0 && (
									<span className="shrink-0 rounded-full bg-red-400/10 px-2.5 py-1 text-xs font-medium text-red-300">
										{project.openIncidents} open{" "}
										{project.openIncidents === 1 ? "incident" : "incidents"}
									</span>
								)}
							</div>

							<p className="mt-2 text-xs text-slate-500">
								{project.monitorCount}{" "}
								{project.monitorCount === 1 ? "monitor" : "monitors"}
								{project.monitorCount > 0 &&
									` (${project.enabledCount} enabled, ${project.disabledCount} disabled)`}
							</p>

							<div className="mt-6 grid grid-cols-2 gap-4">
								<div>
									<p className="text-xs text-slate-500">24h uptime</p>
									<p className="mt-1 text-lg font-semibold text-white">
										{project.health.uptimePercentage === null
											? "N/A"
											: `${project.health.uptimePercentage.toFixed(2)}%`}
									</p>
								</div>
								<div>
									<p className="text-xs text-slate-500">Average response</p>
									<p className="mt-1 text-lg font-semibold text-white">
										{project.health.averageResponseTime === null
											? "N/A"
											: `${project.health.averageResponseTime} ms`}
									</p>
								</div>
							</div>

							<p className="mt-5 border-t border-slate-800 pt-3 text-xs text-slate-500">
								{project.health.totalChecks} checks in the last 24 hours
							</p>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
