import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getMonitorsForUser } from "@/lib/data/monitors";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	const monitors = await getMonitorsForUser(session.user.id);

	return <DashboardClient initialMonitors={monitors} />;
}
