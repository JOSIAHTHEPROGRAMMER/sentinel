import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getPendingDeletion } from "@/lib/data/account-deletion";
import { getUserSettings } from "@/lib/data/user-settings";
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	const [settings, pending] = await Promise.all([
		getUserSettings(session.user.id),
		getPendingDeletion(session.user.id),
	]);

	return (
		<SettingsClient
			name={session.user.name}
			email={session.user.email}
			createdAt={session.user.createdAt.toISOString()}
			settings={settings}
			pendingPurgeAfter={pending?.purgeAfter ?? null}
		/>
	);
}
