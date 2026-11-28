import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession } from "@/lib/auth/session";
import { getProjectsForUser } from "@/lib/data/projects";
import ProjectsClient from "./projects-client";

async function ProjectsContent({ userId }: { userId: string }) {
	const projects = await getProjectsForUser(userId);

	return <ProjectsClient projects={projects} />;
}

function ProjectsSkeleton() {
	return (
		<div aria-busy="true" className="space-y-6">
			<div className="flex items-center justify-between">
				<Skeleton className="h-7 w-32" />
				<Skeleton className="h-9 w-40" />
			</div>
			<Skeleton className="h-72 w-full" />
		</div>
	);
}

export default async function ProjectsPage() {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	return (
		<Suspense fallback={<ProjectsSkeleton />}>
			<ProjectsContent userId={session.user.id} />
		</Suspense>
	);
}
