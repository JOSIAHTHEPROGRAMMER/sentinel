import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getMonitorForUser } from "@/lib/data/monitors";
import MonitorDetailsClient from "./monitor-details-client";

type PageProps = {
	params: Promise<{ id: string }>;
};

export default async function MonitorDetailsPage({ params }: PageProps) {
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
