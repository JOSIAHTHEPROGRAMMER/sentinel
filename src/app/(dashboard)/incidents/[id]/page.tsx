import { Activity, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalDate } from "@/components/ui/local-date";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckTable } from "@/features/checks/components/check-table";
import { getSession } from "@/lib/auth/session";
import { getIncidentDetail } from "@/lib/data/incident-detail";
import { formatDurationMs } from "@/lib/format-duration";

type PageProps = {
	params: Promise<{ id: string }>;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Detail({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<dt className="text-ui text-fg-muted">{label}</dt>
			<dd className="mt-1 text-sm text-fg">{children}</dd>
		</div>
	);
}

async function IncidentDetailContent({ params }: PageProps) {
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
		<>
			<PageHeader
				back={
					<Link
						href="/incidents"
						className="inline-flex items-center gap-1 hover:text-fg"
					>
						<ChevronLeft aria-hidden="true" className="size-4" />
						Incidents
					</Link>
				}
				title={monitor.name}
				description={monitor.url}
				actions={
					<>
						<Badge tone={open ? "danger" : "success"}>
							{open ? "Open" : "Resolved"}
						</Badge>
						<Link
							href={`/monitors/${monitor.id}`}
							className={buttonStyles({ variant: "secondary" })}
						>
							Open monitor
						</Link>
					</>
				}
			/>

			<Panel>
				<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
					<Detail label="Started">
						<LocalDate value={incident.startedAt} />
					</Detail>
					<Detail label="Resolved">
						{incident.resolvedAt ? (
							<LocalDate value={incident.resolvedAt} />
						) : (
							"Still open"
						)}
					</Detail>
					<Detail label={open ? "Duration so far" : "Duration"}>
						{formatDurationMs(durationMs)}
					</Detail>
					<Detail label="Failed checks">
						{during.failed}
						<span className="block text-ui text-fg-subtle">
							of {during.total} during the incident
						</span>
					</Detail>
					<Detail label="Project">
						{project ? (
							<Link
								href={`/projects/${project.id}`}
								className="text-accent-text hover:text-fg"
							>
								{project.name}
							</Link>
						) : (
							"Standalone"
						)}
					</Detail>
				</dl>
			</Panel>

			<Panel title="What happened">
				<p className="wrap-break-word text-sm text-fg">{incident.reason}</p>
				<p className="mt-3 text-ui text-fg-subtle">
					The start time is the first failed check of the streak that opened
					this incident. This monitor is currently set to open an incident after{" "}
					{monitor.failureThreshold} consecutive{" "}
					{monitor.failureThreshold === 1 ? "failure" : "failures"} and to
					resolve it after {monitor.recoveryThreshold} consecutive{" "}
					{monitor.recoveryThreshold === 1 ? "success" : "successes"}. Incidents
					opened before you changed these settings used the values that were in
					place then.
				</p>
			</Panel>

			<Panel
				title="Checks during the incident"
				description={`Oldest first.${
					during.total > during.checks.length
						? ` Showing the first ${during.checks.length} of ${during.total}.`
						: ""
				}`}
				flush
			>
				{during.checks.length === 0 ? (
					<EmptyState
						icon={Activity}
						title="No checks were recorded in this period"
					/>
				) : (
					<CheckTable
						caption="Checks during the incident"
						checks={during.checks}
					/>
				)}
			</Panel>

			{!open && (
				<Panel
					title="Recovery"
					description="The first checks after the incident was resolved"
					flush
				>
					{recovery.length === 0 ? (
						<EmptyState
							icon={Activity}
							title="No checks recorded since the resolution"
						/>
					) : (
						<CheckTable caption="Checks after recovery" checks={recovery} />
					)}
				</Panel>
			)}
		</>
	);
}

function IncidentDetailSkeleton() {
	return (
		<div aria-busy="true" className="space-y-6">
			<Skeleton className="h-7 w-64" />
			<Skeleton className="h-20 w-full" />
			<Skeleton className="h-24 w-full" />
			<Skeleton className="h-64 w-full" />
		</div>
	);
}

export default function IncidentDetailPage({ params }: PageProps) {
	return (
		<Suspense fallback={<IncidentDetailSkeleton />}>
			<IncidentDetailContent params={params} />
		</Suspense>
	);
}
