import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { getAnalyticsSummary, getLastCheckTimes } from "@/lib/data/analytics";
import {
	type AnalyticsRange,
	parseAnalyticsRange,
} from "@/lib/data/analytics-shared";
import { getMonitorsForUser } from "@/lib/data/monitors";
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
	const [monitors, analytics, lastChecks] = await Promise.all([
		getMonitorsForUser(userId),
		getAnalyticsSummary(userId, range),
		getLastCheckTimes(userId),
	]);

	return (
		<DashboardClient
			monitors={monitors}
			analytics={analytics}
			lastChecks={lastChecks}
			now={Date.now()}
		/>
	);
}

function DashboardSkeleton() {
	return (
		<div className="animate-pulse space-y-8">
			<div className="space-y-3">
				<div className="h-4 w-36 rounded bg-slate-800" />
				<div className="h-9 w-64 rounded bg-slate-800" />
				<div className="h-4 w-96 max-w-full rounded bg-slate-800" />
			</div>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{[1, 2, 3, 4].map((item) => (
					<div
						key={item}
						className="h-32 rounded-2xl border border-white/10 bg-slate-900/70"
					/>
				))}
			</div>

			<div className="h-80 rounded-2xl border border-white/10 bg-slate-900/50" />
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
