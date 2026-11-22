import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getIncidentsOverview } from "@/lib/data/incidents";
import { parseIncidentFilters } from "@/lib/data/incidents-shared";
import IncidentsClient from "./incidents-client";

type IncidentsPageProps = {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function IncidentsPage({
	searchParams,
}: IncidentsPageProps) {
	const [session, params] = await Promise.all([getSession(), searchParams]);

	if (!session) {
		redirect("/sign-in");
	}

	const filters = parseIncidentFilters(params);
	const overview = await getIncidentsOverview(session.user.id, filters);

	return (
		<IncidentsClient
			incidents={overview.incidents}
			stats={overview.stats}
			filters={filters}
			monitorOptions={overview.monitorOptions}
			projectOptions={overview.projectOptions}
			initialNow={Date.now()}
		/>
	);
}
