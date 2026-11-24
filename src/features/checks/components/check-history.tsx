"use client";
import Link from "next/link";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { ResponseTimeChart } from "@/components/charts/response-time-chart";
import { LocalDate } from "@/components/ui/local-date";
import type { ChartBucket } from "@/lib/data/analytics-buckets";
import {
	ANALYTICS_RANGES,
	type AnalyticsRange,
	bucketSecondsForSpan,
	DEFAULT_ANALYTICS_RANGE,
	MAX_CUSTOM_WINDOW_MS,
	MIN_CUSTOM_WINDOW_MS,
} from "@/lib/data/analytics-shared";
import type { MonitorStatus } from "@/lib/data/monitor-status";
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

type CheckSummary = {
	totalChecks: number;
	successfulChecks: number;
	failedChecks: number;
	uptimePercentage: number | null;
	averageResponseTimeMs: number | null;
};

type Overview = {
	status: MonitorStatus;
	latestCheckedAt: string | null;
	lastSuccessAt: string | null;
	lastIncident: {
		id: string;

		startedAt: string;
		resolvedAt: string | null;
		reason: string;
	} | null;
};

type ChecksResponse = {
	range?: string;
	windowStart?: string;
	windowEnd?: string;
	overview?: Overview;
	summary?: CheckSummary;
	buckets?: ChartBucket[];
	checks?: CheckResult[];
	error?: string;
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

const tabs: { id: TabId; label: string }[] = [
	{ id: "configuration", label: "Configuration" },
	{ id: "performance", label: "Performance" },
	{ id: "history", label: "History" },
	{ id: "incidents", label: "Incidents" },
];

const RANGE_LABELS: Record<AnalyticsRange, string> = {
	"24h": "the last 24 hours",
	"7d": "the last 7 days",
	"30d": "the last 30 days",
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

const monitorStatusStyles: Record<MonitorStatus, string> = {
	up: "bg-emerald-500/10 text-emerald-400",
	down: "bg-red-500/10 text-red-400",
	stale: "bg-amber-500/10 text-amber-400",
	"no-data": "bg-slate-500/10 text-slate-300",
	disabled: "bg-slate-700/60 text-slate-300",
};

const monitorStatusLabels: Record<MonitorStatus, string> = {
	up: "Up",
	down: "Down",
	stale: "Not reporting",
	"no-data": "Waiting for first check",
	disabled: "Disabled",
};

function formatTimestamp(value: string): string {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "medium",
	}).format(new Date(value));
}

function formatResponseTime(value: number | null): string {
	return value === null ? "N/A" : `${value} ms`;
}

function formatAgo(value: string | null, now: number): string {
	if (!value) {
		return "Never";
	}

	return `${formatDurationMs(now - new Date(value).getTime())} ago`;
}

function Stat({
	label,
	value,
	description,
}: {
	label: string;
	value: string;
	description: string;
}) {
	return (
		<div className="rounded-xl border border-white/10 bg-white/2 p-5">
			<p className="text-sm text-slate-400">{label}</p>
			<p className="mt-2 text-2xl font-semibold text-white">{value}</p>
			<p className="mt-1 text-xs text-slate-500">{description}</p>
		</div>
	);
}

export function CheckHistory({ monitorId, configuration }: CheckHistoryProps) {
	const [activeTab, setActiveTab] = useState<TabId>("configuration");

	const [query, setQuery] = useState(`range=${DEFAULT_ANALYTICS_RANGE}`);
	const [showCustom, setShowCustom] = useState(false);
	const [customFrom, setCustomFrom] = useState("");
	const [customTo, setCustomTo] = useState("");
	const [customError, setCustomError] = useState("");

	const [data, setData] = useState<ChecksResponse | null>(null);
	const [loadedAt, setLoadedAt] = useState(0);
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
				`/api/monitors/${monitorId}/checks?${query}`,
				{ signal: controller.signal },
			);

			const body: ChecksResponse = await response.json();

			if (!response.ok) {
				throw new Error(body.error ?? "Failed to load check history");
			}

			setData(body);
			setLoadedAt(Date.now());
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
	}, [monitorId, query]);

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

			const body: { incidents?: Incident[]; error?: string } =
				await response.json();

			if (!response.ok) {
				throw new Error(body.error ?? "Failed to load incidents");
			}

			setIncidents(body.incidents ?? []);
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

	function choosePreset(range: AnalyticsRange) {
		setShowCustom(false);
		setCustomError("");
		setQuery(`range=${range}`);
	}

	function applyCustomRange() {
		setCustomError("");

		const start = new Date(customFrom).getTime();
		const end = new Date(customTo).getTime();

		if (!customFrom || !customTo || Number.isNaN(start) || Number.isNaN(end)) {
			setCustomError("Choose both a start and an end.");
			return;
		}

		if (start >= end) {
			setCustomError("The start must be before the end.");
			return;
		}

		if (end - start < MIN_CUSTOM_WINDOW_MS) {
			setCustomError("The period must be at least 1 hour.");
			return;
		}

		if (end - start > MAX_CUSTOM_WINDOW_MS) {
			setCustomError("The period can be at most 90 days.");
			return;
		}

		const params = new URLSearchParams({
			from: new Date(start).toISOString(),
			to: new Date(end).toISOString(),
		});

		setQuery(params.toString());
	}

	const showsCheckData = activeTab === "performance" || activeTab === "history";
	const isPreset = data?.range && data.range !== "custom";
	const activePreset = isPreset ? (data?.range as AnalyticsRange) : null;
	const customActive = data?.range === "custom";

	const spanMs =
		data?.windowStart && data.windowEnd
			? new Date(data.windowEnd).getTime() -
				new Date(data.windowStart).getTime()
			: 0;
	const showTime = bucketSecondsForSpan(spanMs) < 86_400;

	const periodLabel =
		isPreset && activePreset && RANGE_LABELS[activePreset]
			? RANGE_LABELS[activePreset]
			: data?.windowStart && data.windowEnd
				? `${formatTimestamp(data.windowStart)} to ${formatTimestamp(data.windowEnd)}`
				: "the selected period";

	const periodShort = activePreset ?? "this period";

	return (
		<section className="space-y-6">
			{data?.overview && (
				<div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<span
								className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${monitorStatusStyles[data.overview.status]}`}
							>
								{monitorStatusLabels[data.overview.status]}
							</span>
							<p className="text-sm text-slate-400">
								Last check {formatAgo(data.overview.latestCheckedAt, loadedAt)}
							</p>
						</div>
					</div>

					<dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
						<div>
							<dt className="text-xs text-slate-500">Last successful check</dt>
							<dd className="mt-1 text-slate-300">
								{data.overview.lastSuccessAt ? (
									<>
										<LocalDate value={data.overview.lastSuccessAt} />
										<span className="text-slate-500">
											{" "}
											({formatAgo(data.overview.lastSuccessAt, loadedAt)})
										</span>
									</>
								) : (
									"Never"
								)}
							</dd>
						</div>

						<div>
							<dt className="text-xs text-slate-500">Last outage</dt>
							<dd className="mt-1 text-slate-300">
								{data.overview.lastIncident ? (
									<>
										<LocalDate value={data.overview.lastIncident.startedAt} />
										<span className="text-slate-500">
											{" "}
											(
											{data.overview.lastIncident.resolvedAt
												? `lasted ${formatDurationMs(new Date(data.overview.lastIncident.resolvedAt).getTime() - new Date(data.overview.lastIncident.startedAt).getTime())}`
												: "still open"}
											)
										</span>
										<span className="mt-1 block wrap-break-word text-xs text-slate-500">
											{data.overview.lastIncident.reason}
										</span>

										<Link
											href={`/incidents/${data.overview.lastIncident.id}`}
											className="mt-1 inline-block text-xs text-cyan-300 hover:text-cyan-200"
										>
											View incident details
										</Link>
									</>
								) : (
									"None recorded"
								)}
							</dd>
						</div>
					</dl>
				</div>
			)}

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
					<div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
						<div>
							<h2 className="text-lg font-semibold text-white">
								Performance overview
							</h2>
							<p className="mt-1 text-sm text-slate-400">
								Based on recorded checks from {periodLabel}.
							</p>
						</div>

						<fieldset className="m-0 inline-flex min-w-0 flex-wrap self-start rounded-lg border border-white/10 p-1">
							<legend className="sr-only">Time range</legend>
							{ANALYTICS_RANGES.map((option) => (
								<button
									aria-pressed={activePreset === option}
									className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
										activePreset === option
											? "bg-cyan-400 text-slate-950"
											: "text-slate-300 hover:bg-white/5"
									}`}
									key={option}
									onClick={() => choosePreset(option)}
									type="button"
								>
									{option}
								</button>
							))}
							<button
								aria-pressed={customActive || showCustom}
								className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
									customActive || showCustom
										? "bg-cyan-400 text-slate-950"
										: "text-slate-300 hover:bg-white/5"
								}`}
								onClick={() => setShowCustom((current) => !current)}
								type="button"
							>
								Custom
							</button>
						</fieldset>
					</div>

					{showCustom && (
						<div className="space-y-3 rounded-xl border border-white/10 bg-white/2 p-4">
							<div className="flex flex-wrap items-end gap-4">
								<div className="space-y-1">
									<label
										htmlFor="custom-from"
										className="block text-xs text-slate-500"
									>
										From
									</label>
									<input
										id="custom-from"
										type="datetime-local"
										value={customFrom}
										onChange={(event) => setCustomFrom(event.target.value)}
										className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
									/>
								</div>

								<div className="space-y-1">
									<label
										htmlFor="custom-to"
										className="block text-xs text-slate-500"
									>
										To
									</label>
									<input
										id="custom-to"
										type="datetime-local"
										value={customTo}
										onChange={(event) => setCustomTo(event.target.value)}
										className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
									/>
								</div>

								<button
									type="button"
									onClick={applyCustomRange}
									className="cursor-pointer rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
								>
									Apply
								</button>
							</div>

							<p className="text-xs text-slate-500">
								Between 1 hour and 90 days, in your local time.
							</p>

							{customError && (
								<p role="alert" className="text-sm text-red-300">
									{customError}
								</p>
							)}
						</div>
					)}

					{!loading && !error && data?.summary && (
						<>
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								<Stat
									label={`Uptime (${periodShort})`}
									value={
										data.summary.uptimePercentage === null
											? "N/A"
											: `${data.summary.uptimePercentage.toFixed(2)}%`
									}
									description={
										data.summary.totalChecks === 0
											? "No checks recorded in this period"
											: `${data.summary.successfulChecks} of ${data.summary.totalChecks} checks succeeded`
									}
								/>
								<Stat
									label="Average response time"
									value={formatResponseTime(data.summary.averageResponseTimeMs)}
									description="Successful checks only"
								/>
								<Stat
									label={`Checks (${periodShort})`}
									value={String(data.summary.totalChecks)}
									description={`${data.summary.failedChecks} failed in this period`}
								/>
							</div>

							<div>
								<h2 className="text-lg font-semibold text-white">
									Response time
								</h2>
								<p className="mt-1 text-sm text-slate-400">
									Average response time of successful checks per interval, from
									oldest to newest. Color shows how many checks in that interval
									passed, and a dot marks an interval that was unusually slow.
								</p>

								{data.summary.totalChecks === 0 ? (
									<div className="mt-4 rounded-xl border border-white/10 p-6">
										<p className="text-sm text-slate-400">
											A chart will appear once checks are recorded in this
											period.
										</p>
									</div>
								) : (
									<div className="mt-4 rounded-xl border border-white/10 p-5">
										<ResponseTimeChart
											buckets={data.buckets ?? []}
											showTime={showTime}
											label="Average response time per interval"
										/>
									</div>
								)}
							</div>
						</>
					)}
				</div>
			)}

			{activeTab === "history" && !loading && !error && data && (
				<div className="space-y-4" role="tabpanel">
					<div>
						<h2 className="text-lg font-semibold text-white">Check history</h2>
						<p className="mt-1 text-sm text-slate-400">
							The 50 most recent monitoring results.
						</p>
					</div>

					{(data.checks ?? []).length === 0 ? (
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
									{(data.checks ?? []).map((check) => (
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
										<th className="border-b border-white/10 px-4 py-3 font-medium">
											Details
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
												<td className="whitespace-nowrap px-4 py-3">
													<Link
														href={`/incidents/${incident.id}`}
														className="text-cyan-300 hover:text-cyan-200"
													>
														View
													</Link>
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
