import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getProjectForUser } from "@/lib/data/projects";
import ProjectDetailsClient from "./project-details-client";

type PageProps = {
	params: Promise<{ id: string }>;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectDetailsPage({ params }: PageProps) {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	const { id } = await params;

	if (!UUID_PATTERN.test(id)) {
		notFound();
	}

	const result = await getProjectForUser(session.user.id, id);

	if (!result) {
		notFound();
	}

	return (
		<ProjectDetailsClient
			project={result.project}
			monitors={result.monitors}
			counts={result.counts}
			health={result.health}
		/>
	);
}
