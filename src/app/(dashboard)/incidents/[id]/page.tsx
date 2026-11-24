import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LocalDate } from "@/components/ui/local-date";
import { getSession } from "@/lib/auth/session";
import { getIncidentDetail } from "@/lib/data/incident-detail";
import { formatDurationMs } from "@/lib/format-duration";

type PageProps = {
	params: Promise<{ id: string }>;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const statusStyles = {
	up: "bg-emerald-500/10 text-emerald-400",
	down: "bg-red-500/10 text-red-400",
	timeout: "bg-amber-500/10 text-amber-400",
	error: "bg-slate-500/10 text-slate-300",
} as const;

const statusLabels = {
	up: "Up",
	down: "Down",
	timeout: "Timeout",
	error: "Error",
} as const;

type TimelineCheck = {
	id: string;
	checkedAt: string;
	status: keyof typeof statusStyles;
	httpStatus: number | null;
	latencyMs: number | null;
	errorMessage: string | null;
};

function CheckTable({ checks }: { checks: TimelineCheck[] }) {
	return (
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
								<LocalDate value={check.checkedAt} />
							</td>
							<td className="px-4 py-3">
								<span
									className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[check.status]}`}
								>
									{statusLabels[check.status]}
								</span>
								{check.errorMessage && (
									<p className="mt-1 max-w-xs wrap-break-word text-xs text-red-400">
										{check.errorMessage}
									</p>
								)}
							</td>
							<td className="px-4 py-3 text-slate-300">
								{check.httpStatus ?? "N/A"}
							</td>
							<td className="px-4 py-3 text-slate-300">
								{check.latencyMs === null ? "N/A" : `${check.latencyMs} ms`}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default async function IncidentDetailPage({ params }: PageProps) {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	const { id } = await params;

	if (!UUID_PATTERN.test(id)) {
		notFound();
	}

	const detail = await getIncidentDetail(session.user.id, id);

	if (!detail) {
		notFound();
	}

	const { incident, monitor, project, during, recovery } = detail;
	const open = incident.resolvedAt === null;
	const endMs = open
		? Date.now()
		: new Date(incident.resolvedAt ?? "").getTime();
	const durationMs = endMs - new Date(incident.startedAt).getTime();

	return (
		<div className="mx-auto max-w-4xl space-y-8">
			<div>
				<Link
					href="/incidents"
					className="text-sm text-slate-400 hover:text-white"
				>
					Incidents
				</Link>

				<div className="mt-3 flex flex-wrap items-center gap-3">
					<h1 className="text-2xl font-semibold tracking-tight text-white">
						{monitor.name}
					</h1>
					<span
						className={`rounded-full px-3 py-1 text-xs font-medium ${
							open
								? "bg-red-400/10 text-red-300"
								: "bg-emerald-400/10 text-emerald-300"
						}`}
					>
						{open ? "Open" : "Resolved"}
					</span>
				</div>

				<p className="mt-2 break-all text-sm text-slate-400">{monitor.url}</p>
				<p className="mt-2 text-xs text-slate-500">
					Project:{" "}
					{project ? (
						<Link
							href={`/projects/${project.id}`}
							className="text-cyan-300 hover:text-cyan-200"
						>
							{project.name}
						</Link>
					) : (
						<span className="text-cyan-300">Standalone</span>
					)}
					{" · "}
					<Link
						href={`/monitors/${monitor.id}`}
						className="text-cyan-300 hover:text-cyan-200"
					>
						Open monitor
					</Link>
				</p>
			</div>

			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<div className="rounded-xl border border-white/10 bg-white/3 p-5">
					<p className="text-sm text-slate-400">Started</p>
					<p className="mt-2 text-sm font-medium text-white">
						<LocalDate value={incident.startedAt} />
					</p>
				</div>
				<div className="rounded-xl border border-white/10 bg-white/3 p-5">
					<p className="text-sm text-slate-400">Resolved</p>
					<p className="mt-2 text-sm font-medium text-white">
						{incident.resolvedAt ? (
							<LocalDate value={incident.resolvedAt} />
						) : (
							"Still open"
						)}
					</p>
				</div>
				<div className="rounded-xl border border-white/10 bg-white/3 p-5">
					<p className="text-sm text-slate-400">
						{open ? "Duration so far" : "Duration"}
					</p>
					<p className="mt-2 text-2xl font-semibold text-white">
						{formatDurationMs(durationMs)}
					</p>
				</div>
				<div className="rounded-xl border border-white/10 bg-white/3 p-5">
					<p className="text-sm text-slate-400">Failed checks</p>
					<p className="mt-2 text-2xl font-semibold text-white">
						{during.failed}
					</p>
					<p className="mt-1 text-xs text-slate-500">
						of {during.total} during the incident
					</p>
				</div>
			</section>

			<section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
				<h2 className="text-sm font-medium text-white">What happened</h2>
				<p className="mt-2 wrap-break-word text-sm leading-6 text-slate-300">
					{incident.reason}
				</p>
				<p className="mt-3 text-xs leading-5 text-slate-500">
					The start time is the first failed check of the streak that opened
					this incident. This monitor is currently set to open an incident after{" "}
					{monitor.failureThreshold} consecutive{" "}
					{monitor.failureThreshold === 1 ? "failure" : "failures"} and to
					resolve it after {monitor.recoveryThreshold} consecutive{" "}
					{monitor.recoveryThreshold === 1 ? "success" : "successes"}. Incidents
					opened before you changed these settings used the values that were in
					place then.
				</p>
			</section>

			<section className="space-y-3">
				<div>
					<h2 className="text-lg font-semibold text-white">
						Checks during the incident
					</h2>
					<p className="mt-1 text-sm text-slate-400">
						Oldest first.
						{during.total > during.checks.length &&
							` Showing the first ${during.checks.length} of ${during.total}.`}
					</p>
				</div>

				{during.checks.length === 0 ? (
					<div className="rounded-xl border border-white/10 p-6">
						<p className="text-sm text-slate-400">
							No checks were recorded in this period.
						</p>
					</div>
				) : (
					<CheckTable checks={during.checks} />
				)}
			</section>

			{!open && (
				<section className="space-y-3">
					<div>
						<h2 className="text-lg font-semibold text-white">Recovery</h2>
						<p className="mt-1 text-sm text-slate-400">
							The first checks after the incident was resolved.
						</p>
					</div>

					{recovery.length === 0 ? (
						<div className="rounded-xl border border-white/10 p-6">
							<p className="text-sm text-slate-400">
								No checks have been recorded since the resolution.
							</p>
						</div>
					) : (
						<CheckTable checks={recovery} />
					)}
				</section>
			)}
		</div>
	);
}
