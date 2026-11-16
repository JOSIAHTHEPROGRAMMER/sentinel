import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getIncidentsForUser } from "@/lib/data/incidents";
import IncidentsClient from "./incidents-client";

export default async function IncidentsPage() {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	const incidents = await getIncidentsForUser(session.user.id);

	return (
		<IncidentsClient initialIncidents={incidents} initialNow={Date.now()} />
	);
}
