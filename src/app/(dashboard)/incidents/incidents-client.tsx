"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LocalDate } from "@/components/ui/local-date";
import {
	DEFAULT_INCIDENT_FILTERS,
	INCIDENT_RANGES,
	INCIDENT_STATUSES,
	type IncidentFilters,
	type IncidentRange,
	type IncidentStats,
	type IncidentStatus,
} from "@/lib/data/incidents-shared";
import { formatDurationMs } from "@/lib/format-duration";

type Incident = {
	id: string;
	monitorId: string;
	monitorName: string;
	monitorUrl: string;
	projectName: string | null;
	startedAt: string;
	resolvedAt: string | null;
	reason: string;
};

type Option = {
	id: string;
	name: string;
};

type IncidentsClientProps = {
	incidents: Incident[];
	stats: IncidentStats;
	filters: IncidentFilters;
	monitorOptions: Option[];
	projectOptions: Option[];
	initialNow: number;
};

const RANGE_LABELS: Record<IncidentRange, string> = {
	"24h": "Last 24 hours",
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	all: "All time",
};

function formatDuration(
	startedAt: string,
	resolvedAt: string | null,
	now: number,
): string {
	const start = new Date(startedAt).getTime();

	if (Number.isNaN(start)) {
		return "Unknown";
	}

	const end = resolvedAt ? new Date(resolvedAt).getTime() : now;

	if (!Number.isFinite(end) || end < start) {
		return "Unknown";
	}

	return formatDurationMs(end - start);
}

function buildUrl(filters: IncidentFilters): string {
	const params = new URLSearchParams();

	if (filters.status !== DEFAULT_INCIDENT_FILTERS.status) {
		params.set("status", filters.status);
	}

	if (filters.range !== DEFAULT_INCIDENT_FILTERS.range) {
		params.set("range", filters.range);
	}

	if (filters.monitorId) {
		params.set("monitor", filters.monitorId);
	}

	if (filters.projectId) {
		params.set("project", filters.projectId);
	}

	const query = params.toString();

	return query ? `/incidents?${query}` : "/incidents";
}

function StatCard({
	label,
	value,
	description,
}: {
	label: string;
	value: string | number;
	description: string;
}) {
	return (
		<div className="rounded-2xl border border-white/10 bg-white/3 p-5">
			<p className="text-sm text-slate-400">{label}</p>
			<p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
			<p className="mt-2 text-xs text-slate-500">{description}</p>
		</div>
	);
}

export default function IncidentsClient({
	incidents,
	stats,
	filters,
	monitorOptions,
	projectOptions,
	initialNow,
}: IncidentsClientProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [now, setNow] = useState(initialNow);

	useEffect(() => {
		const interval = window.setInterval(() => {
			setNow(Date.now());
		}, 60_000);

		return () => window.clearInterval(interval);
	}, []);

	function applyFilters(changes: Partial<IncidentFilters>) {
		startTransition(() => {
			router.push(buildUrl({ ...filters, ...changes }), { scroll: false });
		});
	}

	const matchingCount =
		filters.status === "open"
			? stats.open
			: filters.status === "resolved"
				? stats.resolved
				: stats.total;

	const hasFilters =
		filters.status !== DEFAULT_INCIDENT_FILTERS.status ||
		filters.range !== DEFAULT_INCIDENT_FILTERS.range ||
		filters.monitorId !== null ||
		filters.projectId !== null;

	return (
		<div className="space-y-8">
			<div>
				<p className="text-sm font-medium text-cyan-300">Reliability</p>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight">
					Incidents
				</h1>
				<p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
					Track outages, investigate failures, and review service recovery.
				</p>
			</div>

			<section
				aria-label="Incident statistics"
				className={`grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-4 ${
					isPending ? "opacity-60" : ""
				}`}
			>
				<StatCard
					label="Incidents"
					value={stats.total}
					description={`${stats.open} open, ${stats.resolved} resolved. ${RANGE_LABELS[filters.range]}`}
				/>
				<StatCard
					label="Open now"
					value={stats.open}
					description="Unresolved, among incidents started in this period"
				/>
				<StatCard
					label="Average time to resolution"
					value={
						stats.averageResolutionMs === null
							? "N/A"
							: formatDurationMs(stats.averageResolutionMs)
					}
					description="Resolved incidents only"
				/>
				<StatCard
					label="Frequency"
					value={stats.perDay === null ? "N/A" : `${stats.perDay} / day`}
					description={
						stats.perDay === null
							? "Choose a time range to see frequency"
							: "Incidents started per day"
					}
				/>
			</section>

			<section className="overflow-hidden rounded-2xl border border-white/10 bg-white/2">
				<div className="space-y-4 border-b border-white/10 p-5">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div>
							<h2 className="font-semibold">Incident history</h2>
							<p className="mt-1 text-sm text-slate-400">
								Outages detected by your monitors.
							</p>
						</div>

						<fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
							<legend className="sr-only">Status</legend>
							{INCIDENT_STATUSES.map((value: IncidentStatus) => (
								<button
									key={value}
									type="button"
									onClick={() => applyFilters({ status: value })}
									aria-pressed={filters.status === value}
									className={`cursor-pointer rounded-lg px-3 py-2 text-sm capitalize transition ${
										filters.status === value
											? "bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20"
											: "text-slate-400 hover:bg-white/5 hover:text-slate-200"
									}`}
								>
									{value}
								</button>
							))}
						</fieldset>
					</div>

					<div className="flex flex-wrap items-end gap-4">
						<div className="space-y-1">
							<label
								htmlFor="incident-range"
								className="block text-xs text-slate-500"
							>
								Period
							</label>
							<select
								id="incident-range"
								value={filters.range}
								onChange={(event) =>
									applyFilters({ range: event.target.value as IncidentRange })
								}
								className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
							>
								{INCIDENT_RANGES.map((range) => (
									<option key={range} value={range}>
										{RANGE_LABELS[range]}
									</option>
								))}
							</select>
						</div>

						<div className="space-y-1">
							<label
								htmlFor="incident-monitor"
								className="block text-xs text-slate-500"
							>
								Monitor
							</label>
							<select
								id="incident-monitor"
								value={filters.monitorId ?? ""}
								onChange={(event) =>
									applyFilters({ monitorId: event.target.value || null })
								}
								className="max-w-56 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
							>
								<option value="">All monitors</option>
								{monitorOptions.map((option) => (
									<option key={option.id} value={option.id}>
										{option.name}
									</option>
								))}
							</select>
						</div>

						<div className="space-y-1">
							<label
								htmlFor="incident-project"
								className="block text-xs text-slate-500"
							>
								Project
							</label>
							<select
								id="incident-project"
								value={filters.projectId ?? ""}
								onChange={(event) =>
									applyFilters({ projectId: event.target.value || null })
								}
								className="max-w-56 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
							>
								<option value="">All projects</option>
								{projectOptions.map((option) => (
									<option key={option.id} value={option.id}>
										{option.name}
									</option>
								))}
							</select>
						</div>

						{hasFilters && (
							<button
								type="button"
								onClick={() =>
									startTransition(() => {
										router.push("/incidents", { scroll: false });
									})
								}
								className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
							>
								Reset filters
							</button>
						)}
					</div>
				</div>

				{incidents.length === 0 ? (
					<div className="p-10 text-center">
						<p className="font-medium">
							{hasFilters
								? "No incidents match these filters"
								: "No incidents yet"}
						</p>
						<p className="mt-2 text-sm text-slate-400">
							{hasFilters
								? "Try a longer period or reset the filters."
								: "When a monitor fails, Sentinel will record the incident here."}
						</p>
					</div>
				) : (
					<div
						className={`divide-y divide-white/5 transition-opacity ${
							isPending ? "opacity-60" : ""
						}`}
					>
						{incidents.map((incident) => {
							const isOpen = incident.resolvedAt === null;

							return (
								<article key={incident.id} className="space-y-4 p-5">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="min-w-0">
											<h3 className="font-medium">{incident.monitorName}</h3>
											<p className="mt-1 text-xs text-slate-500">
												Project:{" "}
												<span className="text-cyan-300">
													{incident.projectName ?? "Standalone"}
												</span>
											</p>
											<p className="mt-2 break-all text-sm text-slate-400">
												{incident.monitorUrl}
											</p>
										</div>

										<span
											className={`rounded-full px-3 py-1 text-xs font-medium ${
												isOpen
													? "bg-red-400/10 text-red-300"
													: "bg-emerald-400/10 text-emerald-300"
											}`}
										>
											{isOpen ? "Open" : "Resolved"}
										</span>
									</div>

									<p className="wrap-break-word text-sm text-slate-300">
										{incident.reason}
									</p>

									<div className="grid gap-3 text-sm sm:grid-cols-3">
										<div>
											<p className="text-xs text-slate-500">Started</p>
											<p className="mt-1 text-slate-300">
												<LocalDate value={incident.startedAt} />
											</p>
										</div>

										<div>
											<p className="text-xs text-slate-500">
												{isOpen ? "Duration so far" : "Duration"}
											</p>
											<p className="mt-1 text-slate-300">
												{formatDuration(
													incident.startedAt,
													incident.resolvedAt,
													now,
												)}
											</p>
										</div>

										<div>
											<p className="text-xs text-slate-500">Resolved</p>
											<p className="mt-1 text-slate-300">
												{incident.resolvedAt && (
													<LocalDate value={incident.resolvedAt} />
												)}
											</p>
										</div>
									</div>
								</article>
							);
						})}
					</div>
				)}

				{matchingCount > incidents.length && (
					<p className="border-t border-white/10 px-5 py-3 text-xs text-slate-500">
						Showing the {incidents.length} most recent of {matchingCount}{" "}
						incidents. Narrow the period or filters to see others.
					</p>
				)}
			</section>
		</div>
	);
}
