import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { getMonitorForUser } from "@/lib/data/monitors";
import MonitorDetailsClient from "./monitor-details-client";

type PageProps = {
	params: Promise<{ id: string }>;
};

async function MonitorDetailsContent({ params }: PageProps) {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	const { id } = await params;

	const isUuid =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

	if (!isUuid) {
		notFound();
	}

	const monitor = await getMonitorForUser(session.user.id, id);

	if (!monitor) {
		notFound();
	}

	return <MonitorDetailsClient initialMonitor={monitor} />;
}

function MonitorDetailsSkeleton() {
	return (
		<div className="animate-pulse space-y-6">
			<div className="space-y-3">
				<div className="h-8 w-64 rounded bg-slate-800" />
				<div className="h-4 w-80 max-w-full rounded bg-slate-800" />
			</div>
			<div className="h-40 rounded-2xl border border-white/10 bg-slate-900/70" />
			<div className="h-64 rounded-2xl border border-white/10 bg-slate-900/70" />
		</div>
	);
}

export default function MonitorDetailsPage({ params }: PageProps) {
	return (
		<Suspense fallback={<MonitorDetailsSkeleton />}>
			<MonitorDetailsContent params={params} />
		</Suspense>
	);
}
