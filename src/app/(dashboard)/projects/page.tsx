import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getProjectsForUser } from "@/lib/data/projects";
import ProjectsClient from "./projects-client";

export default async function ProjectsPage() {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	const projects = await getProjectsForUser(session.user.id);

	return <ProjectsClient projects={projects} />;
}
