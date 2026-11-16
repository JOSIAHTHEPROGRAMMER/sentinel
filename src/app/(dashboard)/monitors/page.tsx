import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getMonitorsForUser } from "@/lib/data/monitors";
import MonitorsClient from "./monitors-client";

export default async function MonitorsPage() {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	const monitors = await getMonitorsForUser(session.user.id);

	return <MonitorsClient initialMonitors={monitors} />;
}
