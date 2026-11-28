import Link from "next/link";
import { LocalDate } from "@/components/ui/local-date";
import { MonitorStatusBadge } from "@/components/ui/monitor-status-badge";
import { formatDurationMs } from "@/lib/format-duration";
import type { Overview } from "../types";

function formatAgo(value: string | null, now: number): string {
	if (!value) {
		return "Never";
	}

	return `${formatDurationMs(now - new Date(value).getTime())} ago`;
}

export function MonitorOverview({
	overview,
	now,
}: {
	overview: Overview;
	now: number;
}) {
	const incident = overview.lastIncident;

	return (
		<section
			aria-label="Current state"
			className="rounded-panel border border-border bg-surface"
		>
			<dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
				<div>
					<dt className="text-ui text-fg-muted">Status</dt>
					<dd className="mt-1.5">
						<MonitorStatusBadge status={overview.status} />
					</dd>
				</div>

				<div>
					<dt className="text-ui text-fg-muted">Last check</dt>
					<dd className="mt-1 text-sm text-fg">
						{formatAgo(overview.latestCheckedAt, now)}
					</dd>
				</div>

				<div>
					<dt className="text-ui text-fg-muted">Last successful check</dt>
					<dd className="mt-1 text-sm text-fg">
						{overview.lastSuccessAt ? (
							<>
								{formatAgo(overview.lastSuccessAt, now)}
								<span className="block text-ui text-fg-subtle">
									<LocalDate value={overview.lastSuccessAt} />
								</span>
							</>
						) : (
							"Never"
						)}
					</dd>
				</div>

				<div>
					<dt className="text-ui text-fg-muted">Last outage</dt>
					<dd className="mt-1 text-sm text-fg">
						{incident ? (
							<>
								<LocalDate value={incident.startedAt} />
								<span className="text-fg-subtle">
									{incident.resolvedAt
										? `, lasted ${formatDurationMs(
												new Date(incident.resolvedAt).getTime() -
													new Date(incident.startedAt).getTime(),
											)}`
										: ", still open"}
								</span>
								<span className="mt-0.5 block wrap-break-word text-ui text-fg-muted">
									{incident.reason}
								</span>
								<Link
									href={`/incidents/${incident.id}`}
									className="mt-0.5 inline-block text-ui font-medium text-accent-text hover:text-fg"
								>
									View incident
								</Link>
							</>
						) : (
							"None recorded"
						)}
					</dd>
				</div>
			</dl>
		</section>
	);
}
