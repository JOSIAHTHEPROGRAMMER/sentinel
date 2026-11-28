import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession } from "@/lib/auth/session";
import { getAnalyticsSummary, getDashboardTrend } from "@/lib/data/analytics";
import {
	type AnalyticsRange,
	parseAnalyticsRange,
} from "@/lib/data/analytics-shared";
import { getMonitorHealth } from "@/lib/data/monitor-health";
import { buildMonitorRows } from "@/lib/data/monitor-rows";
import { getMonitorsForUser } from "@/lib/data/monitors";
import { getRecentIncidents } from "@/lib/data/recent-incidents";
import DashboardClient from "./dashboard-client";

type DashboardPageProps = {
	searchParams: Promise<{ range?: string | string[] }>;
};

async function DashboardContent({
	userId,
	range,
}: {
	userId: string;
	range: AnalyticsRange;
}) {
	const now = Date.now();

	const [monitors, analytics, health, trend, incidents] = await Promise.all([
		getMonitorsForUser(userId),
		getAnalyticsSummary(userId, range),
		getMonitorHealth(userId, now),
		getDashboardTrend(userId, range),
		getRecentIncidents(userId),
	]);

	return (
		<DashboardClient
			rows={buildMonitorRows(monitors, health, now)}
			analytics={analytics}
			trend={trend}
			openIncidents={incidents.open}
			resolvedIncidents={incidents.resolved}
			now={now}
		/>
	);
}

function DashboardSkeleton() {
	return (
		<div aria-busy="true" className="space-y-6">
			<div className="flex items-center justify-between">
				<Skeleton className="h-7 w-40" />
				<Skeleton className="h-9 w-32" />
			</div>
			<Skeleton className="h-14 w-full" />
			<Skeleton className="h-96 w-full" />
			<Skeleton className="h-64 w-full" />
		</div>
	);
}

export default async function DashboardPage({
	searchParams,
}: DashboardPageProps) {
	const [session, params] = await Promise.all([getSession(), searchParams]);

	if (!session) {
		redirect("/sign-in");
	}

	const range = parseAnalyticsRange(params.range);

	return (
		<Suspense fallback={<DashboardSkeleton />}>
			<DashboardContent userId={session.user.id} range={range} />
		</Suspense>
	);
}
