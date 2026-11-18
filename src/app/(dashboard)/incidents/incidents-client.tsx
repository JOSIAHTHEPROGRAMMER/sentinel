"use client";

import { useEffect, useState } from "react";
import { LocalDate } from "@/components/ui/local-date";
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

type Filter = "all" | "open" | "resolved";

type IncidentsClientProps = {
	initialIncidents: Incident[];
	initialNow: number;
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

export default function IncidentsClient({
	initialIncidents,
	initialNow,
}: IncidentsClientProps) {
	const [incidents] = useState<Incident[]>(initialIncidents);
	const [filter, setFilter] = useState<Filter>("all");
	const [now, setNow] = useState(initialNow);

	useEffect(() => {
		const interval = window.setInterval(() => {
			setNow(Date.now());
		}, 60_000);

		return () => window.clearInterval(interval);
	}, []);

	const filteredIncidents = incidents.filter((incident) => {
		if (filter === "open") {
			return incident.resolvedAt === null;
		}

		if (filter === "resolved") {
			return incident.resolvedAt !== null;
		}

		return true;
	});

	const openCount = incidents.filter(
		(incident) => incident.resolvedAt === null,
	).length;

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

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-2xl border border-white/10 bg-white/3 p-5">
					<p className="text-sm text-slate-400">Open incidents</p>
					<p className="mt-3 text-3xl font-semibold tabular-nums">
						{openCount}
					</p>
					<p className="mt-2 text-xs text-slate-500">Currently unresolved</p>
				</div>

				<div className="rounded-2xl border border-white/10 bg-white/3 p-5">
					<p className="text-sm text-slate-400">Total incidents loaded</p>
					<p className="mt-3 text-3xl font-semibold tabular-nums">
						{incidents.length}
					</p>
					<p className="mt-2 text-xs text-slate-500">
						Most recent 100 incidents
					</p>
				</div>
			</div>

			<section className="overflow-hidden rounded-2xl border border-white/10 bg-white/2">
				<div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 p-5">
					<div>
						<h2 className="font-semibold">Incident history</h2>
						<p className="mt-1 text-sm text-slate-400">
							Outages detected by your monitors.
						</p>
					</div>

					<div className="flex flex-wrap gap-2">
						{(["all", "open", "resolved"] as const).map((value) => (
							<button
								key={value}
								type="button"
								onClick={() => setFilter(value)}
								aria-pressed={filter === value}
								className={`cursor-pointer rounded-lg px-3 py-2 text-sm capitalize transition ${
									filter === value
										? "bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20"
										: "text-slate-400 hover:bg-white/5 hover:text-slate-200"
								}`}
							>
								{value}
							</button>
						))}
					</div>
				</div>

				{filteredIncidents.length === 0 ? (
					<div className="p-10 text-center">
						<p className="font-medium">
							{filter === "open"
								? "No open incidents"
								: filter === "resolved"
									? "No resolved incidents"
									: "No incidents yet"}
						</p>
						<p className="mt-2 text-sm text-slate-400">
							When a monitor fails, Sentinel will record the incident here.
						</p>
					</div>
				) : (
					<div className="divide-y divide-white/5">
						{filteredIncidents.map((incident) => {
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
			</section>
		</div>
	);
}
