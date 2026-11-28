import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession } from "@/lib/auth/session";
import { getMonitorHealth } from "@/lib/data/monitor-health";
import { buildMonitorRows } from "@/lib/data/monitor-rows";
import { getMonitorsForUser } from "@/lib/data/monitors";
import { getProjectOptions } from "@/lib/data/project-options";
import MonitorsClient from "./monitors-client";

type MonitorsPageProps = {
	searchParams: Promise<{ project?: string | string[] }>;
};

async function MonitorsContent({
	userId,
	projectFilter,
}: {
	userId: string;
	projectFilter: string | undefined;
}) {
	const now = Date.now();

	const [monitors, health, projects] = await Promise.all([
		getMonitorsForUser(userId),
		getMonitorHealth(userId, now),
		getProjectOptions(userId),
	]);

	return (
		<MonitorsClient
			rows={buildMonitorRows(monitors, health, now)}
			projects={projects}
			projectFilter={projectFilter}
			now={now}
		/>
	);
}

function MonitorsSkeleton() {
	return (
		<div aria-busy="true" className="space-y-6">
			<div className="flex items-center justify-between">
				<Skeleton className="h-7 w-32" />
				<Skeleton className="h-9 w-40" />
			</div>
			<Skeleton className="h-96 w-full" />
		</div>
	);
}

export default async function MonitorsPage({
	searchParams,
}: MonitorsPageProps) {
	const [session, params] = await Promise.all([getSession(), searchParams]);

	if (!session) {
		redirect("/sign-in");
	}

	const projectFilter =
		typeof params.project === "string" ? params.project : undefined;

	return (
		<Suspense fallback={<MonitorsSkeleton />}>
			<MonitorsContent userId={session.user.id} projectFilter={projectFilter} />
		</Suspense>
	);
}
