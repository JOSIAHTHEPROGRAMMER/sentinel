import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { getMonitorsForUser } from "@/lib/data/monitors";
import { getProjectsForUser } from "@/lib/data/projects";
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
	const [monitors, projects] = await Promise.all([
		getMonitorsForUser(userId),
		getProjectsForUser(userId),
	]);

	return (
		<MonitorsClient
			monitors={monitors}
			projects={projects.map((project) => ({
				id: project.id,
				name: project.name,
			}))}
			projectFilter={projectFilter}
		/>
	);
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
