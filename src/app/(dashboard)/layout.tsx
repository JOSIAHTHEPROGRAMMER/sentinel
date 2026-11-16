import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getSession } from "@/lib/auth/session";

export default async function DashboardLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	return (
		<DashboardShell userName={session.user.name} userEmail={session.user.email}>
			{children}
		</DashboardShell>
	);
}
