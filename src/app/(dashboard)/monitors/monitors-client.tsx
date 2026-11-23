"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

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

type MonitorsClientProps = {
	monitors: Monitor[];
	projects: Project[];
	projectFilter: string | undefined;
};

const STANDALONE = "standalone";

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
	monitors,
	projects,
	projectFilter,
}: MonitorsClientProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const projectNames = new Map(
		projects.map((project) => [project.id, project.name]),
	);

	// An unknown or stale filter value (for example a deleted project) is ignored
	const activeFilter =
		projectFilter === STANDALONE || projectNames.has(projectFilter ?? "")
			? projectFilter
			: undefined;

	const filtered = monitors.filter((monitor) => {
		if (activeFilter === undefined) {
			return true;
		}

		if (activeFilter === STANDALONE) {
			return monitor.projectId === null;
		}

		return monitor.projectId === activeFilter;
	});

	function refresh() {
		startTransition(() => {
			router.refresh();
		});
	}

	function changeFilter(value: string) {
		startTransition(() => {
			router.push(value === "" ? "/monitors" : `/monitors?project=${value}`, {
				scroll: false,
			});
		});
	}

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
						onClick={refresh}
						disabled={isPending}
						className="cursor-pointer rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 disabled:cursor-wait disabled:opacity-50"
					>
						{isPending ? "Refreshing..." : "Refresh"}
					</button>
					<Link
						href="/monitors/new"
						className="rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
					>
						Add monitor
					</Link>
				</div>
			</section>

			<section
				className={`overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 transition-opacity ${
					isPending ? "opacity-60" : ""
				}`}
			>
				<div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-6">
					<div>
						<h2 className="font-semibold text-white">All monitors</h2>
						<p className="mt-1 text-sm text-slate-400">
							{activeFilter === undefined
								? `${monitors.length} configured ${monitors.length === 1 ? "endpoint" : "endpoints"}`
								: `${filtered.length} of ${monitors.length} ${monitors.length === 1 ? "endpoint" : "endpoints"} shown`}
						</p>
					</div>

					{monitors.length > 0 && (
						<div className="space-y-1">
							<label
								htmlFor="monitor-project-filter"
								className="block text-xs text-slate-500"
							>
								Project
							</label>
							<select
								id="monitor-project-filter"
								value={activeFilter ?? ""}
								onChange={(event) => changeFilter(event.target.value)}
								className="max-w-56 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
							>
								<option value="">All projects</option>
								<option value={STANDALONE}>Standalone</option>
								{projects.map((project) => (
									<option key={project.id} value={project.id}>
										{project.name}
									</option>
								))}
							</select>
						</div>
					)}
				</div>

				{monitors.length === 0 ? (
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
				) : filtered.length === 0 ? (
					<div className="px-6 py-12 text-center">
						<p className="font-medium text-white">
							No monitors match this filter
						</p>
						<button
							type="button"
							onClick={() => changeFilter("")}
							className="mt-3 cursor-pointer text-sm text-cyan-300 hover:text-cyan-200"
						>
							Show all projects
						</button>
					</div>
				) : (
					<div className="divide-y divide-white/5">
						{filtered.map((monitor) => (
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
													"Unknown project")
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
