import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PendingDeletionBanner } from "@/components/layout/pending-deletion-banner";
import { getSession } from "@/lib/auth/session";
import { getPendingDeletion } from "@/lib/data/account-deletion";

export default async function DashboardLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	const pending = await getPendingDeletion(session.user.id);

	return (
		<DashboardShell
			userName={session.user.name}
			userEmail={session.user.email}
			banner={
				pending ? (
					<PendingDeletionBanner purgeAfter={pending.purgeAfter} />
				) : null
			}
		>
			{children}
		</DashboardShell>
	);
}
