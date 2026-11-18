"use client";

import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	ANALYTICS_RANGES,
	type AnalyticsRange,
	DEFAULT_ANALYTICS_RANGE,
} from "@/lib/data/analytics-shared";
import { formatDurationMs } from "@/lib/format-duration";

type CheckStatus = "up" | "down" | "timeout" | "error";

type CheckResult = {
	id: string;
	checkedAt: string;
	status: CheckStatus;
	httpStatus: number | null;
	latencyMs: number | null;
	errorMessage: string | null;
};

type ChartBucket = {
	start: string;
	total: number;
	successful: number;
	averageLatencyMs: number | null;
};

type CheckSummary = {
	range: AnalyticsRange;
	totalChecks: number;
	successfulChecks: number;
	failedChecks: number;
	uptimePercentage: number | null;
	averageResponseTimeMs: number | null;
};

type Incident = {
	id: string;
	startedAt: string;
	resolvedAt: string | null;
	reason: string;
};

type CheckHistoryProps = {
	monitorId: string;
	configuration: ReactNode;
};

type TabId = "configuration" | "performance" | "history" | "incidents";

type BucketTone = "healthy" | "degraded" | "down" | "empty";

const tabs: { id: TabId; label: string }[] = [
	{ id: "configuration", label: "Configuration" },
	{ id: "performance", label: "Performance" },
	{ id: "history", label: "History" },
	{ id: "incidents", label: "Incidents" },
];

const RANGE_LABELS: Record<AnalyticsRange, string> = {
	"24h": "last 24 hours",
	"7d": "last 7 days",
	"30d": "last 30 days",
};

const statusStyles: Record<CheckStatus, string> = {
	up: "bg-emerald-500/10 text-emerald-400",
	down: "bg-red-500/10 text-red-400",
	timeout: "bg-amber-500/10 text-amber-400",
	error: "bg-slate-500/10 text-slate-300",
};

const statusLabels: Record<CheckStatus, string> = {
	up: "Up",
	down: "Down",
	timeout: "Timeout",
	error: "Error",
};

const toneStyles: Record<BucketTone, string> = {
	healthy: "bg-emerald-400",
	degraded: "bg-amber-400",
	down: "bg-red-400",
	empty: "bg-white/10",
};

const toneLabels: Record<BucketTone, string> = {
	healthy: "All checks up",
	degraded: "Some checks failed",
	down: "All checks failed",
	empty: "No checks",
};

function formatTimestamp(value: string): string {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "medium",
	}).format(new Date(value));
}

function formatBucketStart(value: string, range: AnalyticsRange): string {
	return new Intl.DateTimeFormat(
		undefined,
		range === "30d"
			? { dateStyle: "medium" }
			: { dateStyle: "medium", timeStyle: "short" },
	).format(new Date(value));
}

function formatResponseTime(value: number | null): string {
	return value === null ? "N/A" : `${value} ms`;
}

function getBucketTone(bucket: ChartBucket): BucketTone {
	if (bucket.total === 0) {
		return "empty";
	}

	if (bucket.successful === bucket.total) {
		return "healthy";
	}

	return bucket.successful === 0 ? "down" : "degraded";
}

export function CheckHistory({ monitorId, configuration }: CheckHistoryProps) {
	const [activeTab, setActiveTab] = useState<TabId>("configuration");
	const [range, setRange] = useState<AnalyticsRange>(DEFAULT_ANALYTICS_RANGE);
	const [checks, setChecks] = useState<CheckResult[]>([]);
	const [buckets, setBuckets] = useState<ChartBucket[]>([]);
	const [summary, setSummary] = useState<CheckSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const controllerRef = useRef<AbortController | null>(null);

	const [incidents, setIncidents] = useState<Incident[]>([]);
	const [incidentsLoadedAt, setIncidentsLoadedAt] = useState(0);
	const [incidentsLoading, setIncidentsLoading] = useState(true);
	const [incidentsError, setIncidentsError] = useState<string | null>(null);
	const incidentsControllerRef = useRef<AbortController | null>(null);

	const loadHistory = useCallback(async () => {
		controllerRef.current?.abort();

		const controller = new AbortController();
		controllerRef.current = controller;

		setLoading(true);
		setError(null);

		try {
			const response = await fetch(
				`/api/monitors/${monitorId}/checks?range=${range}`,
				{ signal: controller.signal },
			);

			const data: {
				checks?: CheckResult[];
				buckets?: ChartBucket[];
				summary?: CheckSummary;
				error?: string;
			} = await response.json();

			if (!response.ok) {
				throw new Error(data.error ?? "Failed to load check history");
			}

			setChecks(data.checks ?? []);
			setBuckets(data.buckets ?? []);
			setSummary(data.summary ?? null);
		} catch (cause) {
			if (controller.signal.aborted) return;

			setError(
				cause instanceof Error ? cause.message : "Failed to load check history",
			);
		} finally {
			if (!controller.signal.aborted) {
				setLoading(false);
			}
		}
	}, [monitorId, range]);

	const loadIncidents = useCallback(async () => {
		incidentsControllerRef.current?.abort();

		const controller = new AbortController();
		incidentsControllerRef.current = controller;

		setIncidentsLoading(true);
		setIncidentsError(null);

		try {
			const response = await fetch(`/api/monitors/${monitorId}/incidents`, {
				signal: controller.signal,
			});

			const data: { incidents?: Incident[]; error?: string } =
				await response.json();

			if (!response.ok) {
				throw new Error(data.error ?? "Failed to load incidents");
			}

			setIncidents(data.incidents ?? []);
			setIncidentsLoadedAt(Date.now());
		} catch (cause) {
			if (controller.signal.aborted) return;

			setIncidentsError(
				cause instanceof Error ? cause.message : "Failed to load incidents",
			);
		} finally {
			if (!controller.signal.aborted) {
				setIncidentsLoading(false);
			}
		}
	}, [monitorId]);

	useEffect(() => {
		void loadHistory();

		return () => {
			controllerRef.current?.abort();
		};
	}, [loadHistory]);

	useEffect(() => {
		if (activeTab !== "incidents") return;

		void loadIncidents();

		return () => {
			incidentsControllerRef.current?.abort();
		};
	}, [activeTab, loadIncidents]);

	const showsCheckData = activeTab === "performance" || activeTab === "history";

	const maxResponseTime = Math.max(
		1,
		...buckets.map((bucket) => bucket.averageLatencyMs ?? 0),
	);

	return (
		<section className="space-y-6">
			<div
				aria-label="Monitor sections"
				className="flex gap-1 border-b border-white/10"
				role="tablist"
			>
				{tabs.map((tab) => {
					const selected = activeTab === tab.id;

					return (
						<button
							aria-selected={selected}
							className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
								selected
									? "border-cyan-400 text-white"
									: "border-transparent text-slate-400 hover:text-slate-200"
							}`}
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							role="tab"
							type="button"
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* Hidden rather than unmounted so unsaved form edits survive tab switches */}
			<div hidden={activeTab !== "configuration"} role="tabpanel">
				{configuration}
			</div>

			{showsCheckData && loading && (
				<p className="text-sm text-slate-400">Loading performance data...</p>
			)}

			{showsCheckData && !loading && error && (
				<div
					className="rounded-lg border border-red-500/20 bg-red-500/5 p-4"
					role="alert"
				>
					<p className="text-sm text-red-400">{error}</p>
					<button
						className="mt-3 text-sm text-white underline underline-offset-4"
						onClick={() => void loadHistory()}
						type="button"
					>
						Try again
					</button>
				</div>
			)}

			{activeTab === "performance" && (
				<div className="space-y-6" role="tabpanel">
					<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
						<div>
							<h2 className="text-lg font-semibold text-white">
								Performance overview
							</h2>
							<p className="mt-1 text-sm text-slate-400">
								Based on recorded checks from the {RANGE_LABELS[range]}.
							</p>
						</div>

						<fieldset className="m-0 inline-flex min-w-0 self-start rounded-lg border border-white/10 p-1">
							<legend className="sr-only">Time range</legend>
							{ANALYTICS_RANGES.map((option) => (
								<button
									aria-pressed={range === option}
									className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
										range === option
											? "bg-cyan-400 text-slate-950"
											: "text-slate-300 hover:bg-white/5"
									}`}
									key={option}
									onClick={() => setRange(option)}
									type="button"
								>
									{option}
								</button>
							))}
						</fieldset>
					</div>

					{!loading && !error && (
						<>
							{summary && (
								<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
									<div className="rounded-xl border border-white/10 bg-white/2 p-5">
										<p className="text-sm text-slate-400">
											{summary.range} uptime
										</p>
										<p className="mt-2 text-2xl font-semibold text-white">
											{summary.uptimePercentage === null
												? "N/A"
												: `${summary.uptimePercentage.toFixed(2)}%`}
										</p>
										<p className="mt-1 text-xs text-slate-500">
											{summary.totalChecks === 0
												? "No checks recorded in this period"
												: `${summary.successfulChecks} of ${summary.totalChecks} checks succeeded`}
										</p>
									</div>

									<div className="rounded-xl border border-white/10 bg-white/2 p-5">
										<p className="text-sm text-slate-400">
											Average response time
										</p>
										<p className="mt-2 text-2xl font-semibold text-white">
											{formatResponseTime(summary.averageResponseTimeMs)}
										</p>
										<p className="mt-1 text-xs text-slate-500">
											Successful checks only
										</p>
									</div>

									<div className="rounded-xl border border-white/10 bg-white/2 p-5">
										<p className="text-sm text-slate-400">
											Checks in {summary.range}
										</p>
										<p className="mt-2 text-2xl font-semibold text-white">
											{summary.totalChecks}
										</p>
										<p className="mt-1 text-xs text-slate-500">
											{summary.failedChecks} failed in this period
										</p>
									</div>
								</div>
							)}

							<div>
								<h2 className="text-lg font-semibold text-white">
									Response time
								</h2>
								<p className="mt-1 text-sm text-slate-400">
									Average response time of successful checks per interval, from
									oldest to newest. Color shows how many checks in that interval
									passed.
								</p>

								{summary?.totalChecks === 0 ? (
									<div className="mt-4 rounded-xl border border-white/10 p-6">
										<p className="text-sm text-slate-400">
											A chart will appear once checks are recorded in this
											period.
										</p>
									</div>
								) : (
									<div className="mt-4 rounded-xl border border-white/10 p-5">
										<div
											aria-label="Average response time per interval"
											className="flex h-36 items-end gap-1"
											role="img"
										>
											{buckets.map((bucket) => {
												const tone = getBucketTone(bucket);
												const height =
													tone === "empty"
														? 4
														: bucket.averageLatencyMs === null
															? 8
															: Math.max(
																	8,
																	(bucket.averageLatencyMs / maxResponseTime) *
																		100,
																);

												return (
													<div
														className={`min-w-0 flex-1 rounded-t-sm ${toneStyles[tone]}`}
														key={bucket.start}
														style={{ height: `${height}%` }}
														title={
															tone === "empty"
																? `${formatBucketStart(bucket.start, range)}: no checks`
																: `${formatBucketStart(bucket.start, range)}: ${bucket.successful} of ${bucket.total} checks up, average ${formatResponseTime(bucket.averageLatencyMs)}`
														}
													/>
												);
											})}
										</div>

										<div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-400">
											{(Object.keys(toneLabels) as BucketTone[]).map((tone) => (
												<span
													className="inline-flex items-center gap-2"
													key={tone}
												>
													<span
														aria-hidden="true"
														className={`size-2 rounded-sm ${toneStyles[tone]}`}
													/>
													{toneLabels[tone]}
												</span>
											))}
										</div>
									</div>
								)}
							</div>
						</>
					)}
				</div>
			)}

			{activeTab === "history" && !loading && !error && (
				<div className="space-y-4" role="tabpanel">
					<div>
						<h2 className="text-lg font-semibold text-white">Check history</h2>
						<p className="mt-1 text-sm text-slate-400">
							The 50 most recent monitoring results.
						</p>
					</div>

					{checks.length === 0 ? (
						<div className="rounded-xl border border-white/10 p-6">
							<p className="text-sm font-medium text-white">
								No checks recorded yet
							</p>
							<p className="mt-1 text-sm text-slate-400">
								Results will appear here after the monitoring worker runs a
								check.
							</p>
						</div>
					) : (
						<div className="max-h-96 overflow-auto rounded-xl border border-white/10 [scrollbar-color:rgba(255,255,255,0.2)_transparent] scrollbar-thin">
							<table className="w-full text-left text-sm">
								<thead className="sticky top-0 z-10 bg-slate-900 text-slate-400">
									<tr>
										<th className="border-b border-white/10 px-4 py-3 font-medium">
											Checked at
										</th>
										<th className="border-b border-white/10 px-4 py-3 font-medium">
											Status
										</th>
										<th className="border-b border-white/10 px-4 py-3 font-medium">
											HTTP
										</th>
										<th className="border-b border-white/10 px-4 py-3 font-medium">
											Response time
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-white/5">
									{checks.map((check) => (
										<tr key={check.id}>
											<td className="whitespace-nowrap px-4 py-3 text-slate-300">
												{formatTimestamp(check.checkedAt)}
											</td>
											<td className="px-4 py-3">
												<span
													className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[check.status]}`}
												>
													{statusLabels[check.status]}
												</span>
												{check.errorMessage && (
													<p className="mt-1 max-w-xs text-xs text-red-400">
														{check.errorMessage}
													</p>
												)}
											</td>
											<td className="px-4 py-3 text-slate-300">
												{check.httpStatus ?? "N/A"}
											</td>
											<td className="px-4 py-3 text-slate-300">
												{formatResponseTime(check.latencyMs)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}

			{activeTab === "incidents" && (
				<div className="space-y-4" role="tabpanel">
					<div>
						<h2 className="text-lg font-semibold text-white">Incidents</h2>
						<p className="mt-1 text-sm text-slate-400">
							The 50 most recent incidents for this monitor.
						</p>
					</div>

					{incidentsLoading && (
						<p className="text-sm text-slate-400">Loading incidents...</p>
					)}

					{!incidentsLoading && incidentsError && (
						<div
							className="rounded-lg border border-red-500/20 bg-red-500/5 p-4"
							role="alert"
						>
							<p className="text-sm text-red-400">{incidentsError}</p>
							<button
								className="mt-3 text-sm text-white underline underline-offset-4"
								onClick={() => void loadIncidents()}
								type="button"
							>
								Try again
							</button>
						</div>
					)}

					{!incidentsLoading && !incidentsError && incidents.length === 0 && (
						<div className="rounded-xl border border-white/10 p-6">
							<p className="text-sm font-medium text-white">
								No incidents recorded
							</p>
							<p className="mt-1 text-sm text-slate-400">
								An incident is opened when a check fails and resolved when a
								later check succeeds.
							</p>
						</div>
					)}

					{!incidentsLoading && !incidentsError && incidents.length > 0 && (
						<div className="max-h-96 overflow-auto rounded-xl border border-white/10 [scrollbar-color:rgba(255,255,255,0.2)_transparent] scrollbar-thin">
							<table className="w-full text-left text-sm">
								<thead className="sticky top-0 z-10 bg-slate-900 text-slate-400">
									<tr>
										<th className="border-b border-white/10 px-4 py-3 font-medium">
											Status
										</th>
										<th className="border-b border-white/10 px-4 py-3 font-medium">
											Started
										</th>
										<th className="border-b border-white/10 px-4 py-3 font-medium">
											Resolved
										</th>
										<th className="border-b border-white/10 px-4 py-3 font-medium">
											Duration
										</th>
										<th className="border-b border-white/10 px-4 py-3 font-medium">
											Reason
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-white/5">
									{incidents.map((incident) => {
										const open = incident.resolvedAt === null;
										const startedMs = new Date(incident.startedAt).getTime();
										const endMs = open
											? incidentsLoadedAt
											: new Date(incident.resolvedAt ?? "").getTime();

										return (
											<tr key={incident.id}>
												<td className="px-4 py-3">
													<span
														className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
															open
																? "bg-red-500/10 text-red-400"
																: "bg-emerald-500/10 text-emerald-400"
														}`}
													>
														{open ? "Open" : "Resolved"}
													</span>
												</td>
												<td className="whitespace-nowrap px-4 py-3 text-slate-300">
													{formatTimestamp(incident.startedAt)}
												</td>
												<td className="whitespace-nowrap px-4 py-3 text-slate-300">
													{incident.resolvedAt
														? formatTimestamp(incident.resolvedAt)
														: "N/A"}
												</td>
												<td className="whitespace-nowrap px-4 py-3 text-slate-300">
													{formatDurationMs(endMs - startedMs)}
													{open ? " so far" : ""}
												</td>
												<td className="max-w-xs wrap-break-word px-4 py-3 text-slate-300">
													{incident.reason}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}
		</section>
	);
}
