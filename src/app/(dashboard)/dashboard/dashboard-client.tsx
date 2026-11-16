"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { LocalDate } from "@/components/ui/local-date";

type Monitor = {
	id: string;
	name: string;
	url: string;
	enabled: boolean;
	intervalSeconds: number;
	timeoutMs: number;
	createdAt: string;
	updatedAt: string;
};

type MonitorResponse = {
	monitors?: Monitor[];
	error?: string;
};

type DashboardClientProps = {
	initialMonitors: Monitor[];
};

function formatInterval(seconds: number): string {
	if (seconds % 3600 === 0) {
		return `${seconds / 3600} hour${seconds / 3600 === 1 ? "" : "s"}`;
	}

	if (seconds % 60 === 0) {
		return `${seconds / 60} min`;
	}

	return `${seconds} sec`;
}

function SummaryCard({
	label,
	value,
	description,
}: {
	label: string;
	value: string | number;
	description: string;
}) {
	return (
		<article className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
			<p className="text-sm text-slate-400">{label}</p>
			<p className="mt-3 text-3xl font-semibold tracking-tight text-white">
				{value}
			</p>
			<p className="mt-2 text-xs text-slate-500">{description}</p>
		</article>
	);
}

export default function DashboardClient({
	initialMonitors,
}: DashboardClientProps) {
	const [monitors, setMonitors] = useState(initialMonitors);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const controllerRef = useRef<AbortController | null>(null);

	const loadMonitors = useCallback(async () => {
		controllerRef.current?.abort();

		const controller = new AbortController();
		controllerRef.current = controller;

		setLoading(true);
		setError(null);

		try {
			const response = await fetch("/api/monitors", {
				method: "GET",
				cache: "no-store",
				signal: controller.signal,
			});

			const data: MonitorResponse = await response.json();

			if (!response.ok) {
				if (response.status === 401) {
					throw new Error("Your session has expired or you are not signed in.");
				}

				throw new Error(data.error ?? "Unable to load your monitors.");
			}

			if (!Array.isArray(data.monitors)) {
				throw new Error("The server returned an unexpected monitor response.");
			}

			setMonitors(data.monitors);
		} catch (cause) {
			if (controller.signal.aborted) {
				return;
			}

			setError(
				cause instanceof Error
					? cause.message
					: "Something went wrong while loading monitors.",
			);
		} finally {
			if (!controller.signal.aborted) {
				setLoading(false);
			}
		}
	}, []);

	const enabledCount = monitors.filter((monitor) => monitor.enabled).length;
	const disabledCount = monitors.length - enabledCount;

	const averageInterval =
		monitors.length > 0
			? Math.round(
					monitors.reduce(
						(total, monitor) => total + monitor.intervalSeconds,
						0,
					) / monitors.length,
				)
			: null;

	return (
		<div className="space-y-8">
			<section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div>
					<p className="text-sm font-medium text-cyan-300">YOUR WORKSPACE</p>
					<h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
						Monitoring overview
					</h1>
					<p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
						Manage your monitored endpoints and review their configuration from
						one place.
					</p>
				</div>

				<button
					type="button"
					onClick={loadMonitors}
					disabled={loading}
					className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5 disabled:cursor-wait disabled:opacity-50"
				>
					{loading ? "Refreshing..." : "Refresh data"}
				</button>
			</section>

			{error && (
				<section
					role="alert"
					className="flex flex-col gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4 sm:flex-row sm:items-center sm:justify-between"
				>
					<div>
						<p className="font-medium text-red-300">
							Could not load dashboard data
						</p>
						<p className="mt-1 text-sm text-slate-400">{error}</p>
					</div>
					<button
						type="button"
						onClick={loadMonitors}
						className="self-start rounded-lg border border-red-400/20 px-3 py-2 text-sm text-red-200 hover:bg-red-400/10 sm:self-center"
					>
						Try again
					</button>
				</section>
			)}

			<section
				aria-label="Monitor summary"
				className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
			>
				<SummaryCard
					label="Total monitors"
					value={loading && monitors.length === 0 ? "..." : monitors.length}
					description="Your configured endpoints"
				/>
				<SummaryCard
					label="Enabled"
					value={loading && monitors.length === 0 ? "..." : enabledCount}
					description="Configured to run checks"
				/>
				<SummaryCard
					label="Disabled"
					value={loading && monitors.length === 0 ? "..." : disabledCount}
					description="Checks are switched off"
				/>
				<SummaryCard
					label="Average interval"
					value={
						loading && monitors.length === 0
							? "..."
							: averageInterval === null
								? "N/A"
								: formatInterval(averageInterval)
					}
					description="Across all configured monitors"
				/>
			</section>

			<section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
				<div className="flex flex-col gap-2 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
					<div>
						<h2 className="text-lg font-semibold text-white">Your monitors</h2>
						<p className="mt-1 text-sm text-slate-400">
							The endpoints configured in your workspace.
						</p>
					</div>
					<span className="text-sm text-slate-500">
						{monitors.length} {monitors.length === 1 ? "monitor" : "monitors"}
					</span>
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
								className="h-16 animate-pulse rounded-lg bg-white/5"
							/>
						))}
					</div>
				) : error && monitors.length === 0 ? (
					<div className="px-6 py-12 text-center">
						<p className="text-sm text-slate-400">
							Monitor information is unavailable until the request succeeds.
						</p>
					</div>
				) : monitors.length === 0 ? (
					<div className="px-6 py-14 text-center">
						<div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl text-cyan-300">
							◎
						</div>
						<h3 className="mt-4 font-medium text-white">No monitors yet</h3>
						<p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
							Add your first endpoint to start building your monitoring
							workspace.
						</p>
						<Link
							href="/monitors/new"
							className="mt-5 inline-flex rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
						>
							Create your first monitor
						</Link>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-180 text-left text-sm">
							<thead className="bg-white/2 text-xs uppercase tracking-wide text-slate-500">
								<tr>
									<th scope="col" className="px-6 py-4 font-medium">
										Monitor
									</th>
									<th scope="col" className="px-6 py-4 font-medium">
										Interval
									</th>
									<th scope="col" className="px-6 py-4 font-medium">
										Timeout
									</th>
									<th scope="col" className="px-6 py-4 font-medium">
										Created
									</th>
									<th scope="col" className="px-6 py-4 font-medium">
										Configuration
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-white/5">
								{monitors.map((monitor) => (
									<tr
										key={monitor.id}
										className="transition hover:bg-white/2.5"
									>
										<td className="px-6 py-4">
											<div className="max-w-sm">
												<p className="font-medium text-slate-100">
													{monitor.name}
												</p>
												<p className="mt-1 truncate text-xs text-slate-500">
													{monitor.url}
												</p>
											</div>
										</td>
										<td className="whitespace-nowrap px-6 py-4 text-slate-300">
											{formatInterval(monitor.intervalSeconds)}
										</td>
										<td className="whitespace-nowrap px-6 py-4 text-slate-300">
											{formatInterval(monitor.timeoutMs / 1000)}
										</td>
										<td className="whitespace-nowrap px-6 py-4 text-slate-400">
											<LocalDate value={monitor.createdAt} />
										</td>
										<td className="px-6 py-4">
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
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<p className="text-xs leading-5 text-slate-500">
				Enabled means checks are configured to run. Actual uptime, response
				times, and incidents will be displayed once the dashboard is connected
				to recorded check history.
			</p>
		</div>
	);
}
