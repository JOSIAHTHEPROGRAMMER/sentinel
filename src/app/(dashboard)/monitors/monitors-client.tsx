"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Monitor = {
	id: string;
	name: string;
	url: string;
	enabled: boolean;
	intervalSeconds: number;
	timeoutMs: number;
	projectId: string | null;
	createdAt: string;
	updatedAt: string;
};

type Project = {
	id: string;
	name: string;
};

type MonitorResponse = {
	monitors?: Monitor[];
	error?: string;
};

type ProjectResponse = {
	projects?: Project[];
	error?: string;
};

type MonitorsClientProps = {
	initialMonitors: Monitor[];
};

function formatInterval(seconds: number): string {
	if (seconds % 3600 === 0) {
		const hours = seconds / 3600;
		return `${hours} hour${hours === 1 ? "" : "s"}`;
	}

	if (seconds % 60 === 0) {
		return `${seconds / 60} min`;
	}

	return `${seconds} sec`;
}

export default function MonitorsClient({
	initialMonitors,
}: MonitorsClientProps) {
	const [monitors, setMonitors] = useState<Monitor[]>(initialMonitors);
	const [projects, setProjects] = useState<Project[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const controllerRef = useRef<AbortController | null>(null);

	const [projectsLoading, setProjectsLoading] = useState(true);

	const loadProjects = useCallback(async () => {
		controllerRef.current?.abort();

		const controller = new AbortController();
		controllerRef.current = controller;

		try {
			const response = await fetch("/api/projects", {
				cache: "no-store",
				signal: controller.signal,
			});

			const data: ProjectResponse = await response.json();

			if (!response.ok || !Array.isArray(data.projects)) {
				throw new Error(data.error ?? "Unable to load projects.");
			}

			setProjects(data.projects);
		} catch (cause) {
			if (controller.signal.aborted) return;

			setError(
				cause instanceof Error ? cause.message : "Unable to load projects.",
			);
		} finally {
			if (!controller.signal.aborted) {
				setProjectsLoading(false);
			}
		}
	}, []);

	const loadMonitors = useCallback(async () => {
		controllerRef.current?.abort();

		const controller = new AbortController();
		controllerRef.current = controller;

		setLoading(true);
		setError(null);

		try {
			const [monitorResponse, projectResponse] = await Promise.all([
				fetch("/api/monitors", {
					cache: "no-store",
					signal: controller.signal,
				}),
				fetch("/api/projects", {
					cache: "no-store",
					signal: controller.signal,
				}),
			]);

			const [monitorData, projectData]: [MonitorResponse, ProjectResponse] =
				await Promise.all([monitorResponse.json(), projectResponse.json()]);

			if (!monitorResponse.ok) {
				throw new Error(
					monitorResponse.status === 401
						? "Your session has expired or you are not signed in."
						: (monitorData.error ?? "Unable to load monitors."),
				);
			}

			if (!Array.isArray(monitorData.monitors)) {
				throw new Error("The server returned an unexpected monitor response.");
			}

			if (!projectResponse.ok || !Array.isArray(projectData.projects)) {
				throw new Error(
					projectData.error ?? "Unable to load Project associations.",
				);
			}

			setMonitors(monitorData.monitors);
			setProjects(projectData.projects);
		} catch (cause) {
			if (controller.signal.aborted) return;

			setError(
				cause instanceof Error ? cause.message : "Unable to load monitors.",
			);
		} finally {
			if (!controller.signal.aborted) {
				setLoading(false);
				setProjectsLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		void loadProjects();

		return () => controllerRef.current?.abort();
	}, [loadProjects]);

	const projectNames = new Map(
		projects.map((project) => [project.id, project.name]),
	);

	return (
		<div className="space-y-8">
			<section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div>
					<p className="text-sm font-medium text-cyan-300">WORKSPACE</p>
					<h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
						Monitors
					</h1>
					<p className="mt-3 text-sm leading-6 text-slate-400">
						Configure and manage the endpoints Sentinel checks.
					</p>
				</div>

				<div className="flex gap-3">
					<button
						type="button"
						onClick={() => void loadMonitors()}
						disabled={loading}
						className="cursor-pointer rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Refresh
					</button>
					<Link
						href="/monitors/new"
						className="rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
					>
						Add monitor
					</Link>
				</div>
			</section>

			{error && (
				<section
					role="alert"
					className="flex flex-col gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4 sm:flex-row sm:items-center sm:justify-between"
				>
					<p className="text-sm text-red-200">{error}</p>
					<button
						type="button"
						onClick={() => void loadMonitors()}
						className="cursor-pointer self-start rounded-lg border border-red-400/20 px-3 py-2 text-sm text-red-200 hover:bg-red-400/10"
					>
						Try again
					</button>
				</section>
			)}

			<section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
				<div className="border-b border-white/10 px-5 py-5 sm:px-6">
					<h2 className="font-semibold text-white">All monitors</h2>
					<p className="mt-1 text-sm text-slate-400">
						{monitors.length} configured{" "}
						{monitors.length === 1 ? "endpoint" : "endpoints"}
					</p>
				</div>

				{loading && monitors.length === 0 ? (
					<div
						role="status"
						aria-label="Loading monitors"
						className="space-y-3 p-6"
					>
						{[1, 2, 3].map((item) => (
							<div
								key={item}
								className="h-20 animate-pulse rounded-lg bg-white/5"
							/>
						))}
					</div>
				) : error && monitors.length === 0 ? (
					<p className="px-6 py-12 text-center text-sm text-slate-400">
						Monitor data is unavailable. Try refreshing the list.
					</p>
				) : monitors.length === 0 ? (
					<div className="px-6 py-14 text-center">
						<div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl text-cyan-300">
							◎
						</div>
						<h3 className="mt-4 font-medium text-white">
							No monitors configured
						</h3>
						<p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
							Add an endpoint to start building your monitoring workspace.
						</p>
						<Link
							href="/monitors/new"
							className="mt-5 inline-flex rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
						>
							Create your first monitor
						</Link>
					</div>
				) : (
					<div className="divide-y divide-white/5">
						{monitors.map((monitor) => (
							<Link
								key={monitor.id}
								href={`/monitors/${monitor.id}`}
								className="flex flex-col gap-4 px-5 py-5 transition hover:bg-white/2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
							>
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-3">
										<h3 className="font-medium text-white">{monitor.name}</h3>
										<span
											className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${
												monitor.enabled
													? "bg-emerald-400/10 text-emerald-300"
													: "bg-slate-700/60 text-slate-300"
											}`}
										>
											<span
												aria-hidden="true"
												className={`size-1.5 rounded-full ${
													monitor.enabled ? "bg-emerald-300" : "bg-slate-400"
												}`}
											/>
											{monitor.enabled ? "Enabled" : "Disabled"}
										</span>
									</div>
									<p className="mt-2 max-w-2xl truncate text-sm text-slate-400">
										{monitor.url}
									</p>
									<p className="mt-2 text-xs text-slate-500">
										Project:{" "}
										<span className="text-cyan-300">
											{monitor.projectId
												? (projectNames.get(monitor.projectId) ??
													(projectsLoading ? "Loading..." : "Unknown Project"))
												: "Standalone"}
										</span>
									</p>
								</div>

								<div className="flex shrink-0 items-center gap-5 text-sm text-slate-400">
									<span>{formatInterval(monitor.intervalSeconds)}</span>
									<span>{monitor.timeoutMs} ms timeout</span>
									<span aria-hidden="true" className="text-lg text-slate-500">
										→
									</span>
								</div>
							</Link>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
