import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { getMonitorsForUser } from "@/lib/data/monitors";
import MonitorsClient from "./monitors-client";

async function MonitorsContent() {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	const monitors = await getMonitorsForUser(session.user.id);

	return <MonitorsClient initialMonitors={monitors} />;
}

function MonitorsSkeleton() {
	return (
		<div className="animate-pulse space-y-6">
			<div className="space-y-3">
				<div className="h-8 w-48 rounded bg-slate-800" />
				<div className="h-4 w-72 max-w-full rounded bg-slate-800" />
			</div>
			<div className="h-12 rounded-xl bg-slate-800" />
			<div className="h-64 rounded-2xl border border-white/10 bg-slate-900/70" />
		</div>
	);
}

export default function MonitorsPage() {
	return (
		<Suspense fallback={<MonitorsSkeleton />}>
			<MonitorsContent />
		</Suspense>
	);
}
