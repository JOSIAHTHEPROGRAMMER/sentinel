"use client";

import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

type CheckStatus = "up" | "down" | "timeout" | "error";

type CheckResult = {
	id: string;
	checkedAt: string;
	status: CheckStatus;
	httpStatus: number | null;
	latencyMs: number | null;
	errorMessage: string | null;
};

type PerformanceCheck = Pick<
	CheckResult,
	"id" | "checkedAt" | "status" | "latencyMs"
>;

type CheckSummary = {
	totalChecks: number;
	successfulChecks: number;
	uptimePercentage: number | null;
	averageResponseTime: number | null;
};

type CheckHistoryProps = {
	monitorId: string;
	configuration: ReactNode;
};

type TabId = "configuration" | "performance" | "history";

const tabs: { id: TabId; label: string }[] = [
	{ id: "configuration", label: "Configuration" },
	{ id: "performance", label: "Performance" },
	{ id: "history", label: "History" },
];

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

const chartStatusStyles: Record<CheckStatus, string> = {
	up: "bg-emerald-400",
	down: "bg-red-400",
	timeout: "bg-amber-400",
	error: "bg-slate-400",
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

export function CheckHistory({ monitorId, configuration }: CheckHistoryProps) {
	const [activeTab, setActiveTab] = useState<TabId>("configuration");
	const [checks, setChecks] = useState<CheckResult[]>([]);
	const [performanceChecks, setPerformanceChecks] = useState<
		PerformanceCheck[]
	>([]);

	const [summary, setSummary] = useState<CheckSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const controllerRef = useRef<AbortController | null>(null);

	const loadHistory = useCallback(async () => {
		controllerRef.current?.abort();

		const controller = new AbortController();
		controllerRef.current = controller;

		setLoading(true);
		setError(null);

		try {
			const response = await fetch(`/api/monitors/${monitorId}/checks`, {
				signal: controller.signal,
			});

			const data: {
				checks?: CheckResult[];
				performanceChecks?: PerformanceCheck[];
				summary?: CheckSummary;
				error?: string;
			} = await response.json();

			if (!response.ok) {
				throw new Error(data.error ?? "Failed to load check history");
			}

			setChecks(data.checks ?? []);
			setPerformanceChecks(data.performanceChecks ?? []);
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
	}, [monitorId]);

	useEffect(() => {
		void loadHistory();

		return () => {
			controllerRef.current?.abort();
		};
	}, [loadHistory]);

	const chronologicalChecks = [...performanceChecks].reverse();
	const maxResponseTime = Math.max(
		1,
		...chronologicalChecks.map((check) => check.latencyMs ?? 0),
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

			{activeTab !== "configuration" && loading && (
				<p className="text-sm text-slate-400">Loading performance data...</p>
			)}

			{activeTab !== "configuration" && !loading && error && (
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

			{activeTab === "performance" && !loading && !error && (
				<div className="space-y-6" role="tabpanel">
					<div>
						<h2 className="text-lg font-semibold text-white">
							Performance overview
						</h2>
						<p className="mt-1 text-sm text-slate-400">
							Based on recorded checks from the last 24 hours.
						</p>
					</div>

					{summary && (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							<div className="rounded-xl border border-white/10 bg-white/2 p-5">
								<p className="text-sm text-slate-400">24-hour uptime</p>
								<p className="mt-2 text-2xl font-semibold text-white">
									{summary.uptimePercentage === null
										? "N/A"
										: `${summary.uptimePercentage}%`}
								</p>
								<p className="mt-1 text-xs text-slate-500">
									{summary.totalChecks === 0
										? "No checks recorded in this period"
										: `${summary.successfulChecks} of ${summary.totalChecks} checks succeeded`}
								</p>
							</div>

							<div className="rounded-xl border border-white/10 bg-white/2 p-5">
								<p className="text-sm text-slate-400">Average response time</p>
								<p className="mt-2 text-2xl font-semibold text-white">
									{formatResponseTime(summary.averageResponseTime)}
								</p>
								<p className="mt-1 text-xs text-slate-500">
									Successful and failed checks with recorded latency
								</p>
							</div>

							<div className="rounded-xl border border-white/10 bg-white/2 p-5">
								<p className="text-sm text-slate-400">Checks in 24 hours</p>
								<p className="mt-2 text-2xl font-semibold text-white">
									{summary.totalChecks}
								</p>
								<p className="mt-1 text-xs text-slate-500">
									Total recorded monitoring attempts
								</p>
							</div>
						</div>
					)}

					<div>
						<h2 className="text-lg font-semibold text-white">Response time</h2>
						<p className="mt-1 text-sm text-slate-400">
							Most recent checks, displayed from oldest to newest. Bar height
							represents response time; color represents check status.
						</p>

						{performanceChecks.length === 0 ? (
							<div className="mt-4 rounded-xl border border-white/10 p-6">
								<p className="text-sm text-slate-400">
									A chart will appear after the first check is recorded.
								</p>
							</div>
						) : (
							<div className="mt-4 rounded-xl border border-white/10 p-5">
								<div
									aria-label="Response times for recent monitor checks"
									className="flex h-36 items-end gap-1"
									role="img"
								>
									{chronologicalChecks.map((check) => {
										const height =
											check.latencyMs === null
												? 4
												: Math.max(
														8,
														(check.latencyMs / maxResponseTime) * 100,
													);

										return (
											<div
												className={`min-w-0 flex-1 rounded-t-sm ${chartStatusStyles[check.status]}`}
												key={check.id}
												style={{ height: `${height}%` }}
												title={`${formatTimestamp(check.checkedAt)}: ${formatResponseTime(check.latencyMs)} (${statusLabels[check.status]})`}
											/>
										);
									})}
								</div>

								<div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-400">
									{(Object.keys(statusLabels) as CheckStatus[]).map(
										(status) => (
											<span
												className="inline-flex items-center gap-2"
												key={status}
											>
												<span
													aria-hidden="true"
													className={`size-2 rounded-sm ${chartStatusStyles[status]}`}
												/>
												{statusLabels[status]}
											</span>
										),
									)}
								</div>
								<p className="mt-3 text-xs text-slate-500">
									{performanceChecks.length} most recent{" "}
									{performanceChecks.length === 1 ? "check" : "checks"} shown
								</p>
							</div>
						)}
					</div>
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
		</section>
	);
}
