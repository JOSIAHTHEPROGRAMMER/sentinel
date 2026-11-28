"use client";

import {
	Activity,
	Folder,
	LayoutDashboard,
	LogOut,
	Menu,
	Settings,
	ShieldCheck,
	TriangleAlert,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/cn";

const navigation = [
	{
		label: "Monitoring",
		items: [
			{ label: "Overview", href: "/dashboard", icon: LayoutDashboard },
			{ label: "Monitors", href: "/monitors", icon: Activity },
			{ label: "Projects", href: "/projects", icon: Folder },
			{ label: "Incidents", href: "/incidents", icon: TriangleAlert },
		],
	},
	{
		label: "Account",
		items: [{ label: "Settings", href: "/settings", icon: Settings }],
	},
];

type DashboardShellProps = {
	children: ReactNode;
	userName: string;
	userEmail: string;
	banner?: ReactNode;
};

function Logo() {
	return (
		<Link
			href="/dashboard"
			className="flex items-center gap-2.5 rounded-control"
		>
			<span className="flex size-7 items-center justify-center rounded-control bg-accent text-accent-fg">
				<ShieldCheck aria-hidden="true" className="size-4" />
			</span>
			<span className="text-sm font-semibold text-fg">Sentinel</span>
		</Link>
	);
}

export function DashboardShell({
	children,
	userName,
	userEmail,
	banner,
}: DashboardShellProps) {
	const pathname = usePathname();
	const router = useRouter();
	const [signingOut, setSigningOut] = useState(false);
	const [error, setError] = useState("");
	// The menu is open only on the page it was opened from, so navigating closes it
	const [openedAt, setOpenedAt] = useState<string | null>(null);
	const menuOpen = openedAt === pathname;

	async function handleSignOut() {
		setSigningOut(true);
		setError("");

		try {
			const result = await authClient.signOut();

			if (result.error) {
				setError(result.error.message ?? "Unable to sign out.");
				return;
			}

			router.replace("/sign-in");
			router.refresh();
		} catch {
			setError("Unable to sign out. Please try again.");
		} finally {
			setSigningOut(false);
		}
	}

	const initial = userName.trim().charAt(0).toUpperCase() || "?";

	return (
		<div className="min-h-screen bg-bg text-fg md:flex">
			<div className="flex h-14 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
				<Logo />
				<Button
					variant="quiet"
					size="sm"
					className="w-8 px-0"
					aria-label={menuOpen ? "Close menu" : "Open menu"}
					aria-expanded={menuOpen}
					aria-controls="app-sidebar"
					onClick={() => setOpenedAt(menuOpen ? null : pathname)}
				>
					{menuOpen ? (
						<X aria-hidden="true" className="size-4" />
					) : (
						<Menu aria-hidden="true" className="size-4" />
					)}
				</Button>
			</div>

			<aside
				id="app-sidebar"
				className={cn(
					"w-full shrink-0 flex-col border-b border-border bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-58 md:border-r md:border-b-0",
					menuOpen ? "flex" : "hidden",
				)}
			>
				<div className="hidden h-14 items-center px-4 md:flex">
					<Logo />
				</div>

				<nav
					aria-label="Main navigation"
					className="flex-1 space-y-5 overflow-y-auto px-3 py-3"
				>
					{navigation.map((group) => (
						<div key={group.label}>
							<p className="px-2 pb-1.5 text-xs font-medium text-fg-subtle">
								{group.label}
							</p>
							<ul className="space-y-0.5">
								{group.items.map((item) => {
									const active =
										pathname === item.href ||
										(item.href !== "/dashboard" &&
											pathname.startsWith(`${item.href}/`));
									const Icon = item.icon;

									return (
										<li key={item.href}>
											<Link
												href={item.href}
												aria-current={active ? "page" : undefined}
												className={cn(
													"flex h-8 items-center gap-2.5 rounded-control px-2 text-sm font-medium transition-colors",
													active
														? "bg-accent-subtle text-fg"
														: "text-fg-muted hover:bg-raised hover:text-fg",
												)}
											>
												<Icon
													aria-hidden="true"
													className={cn(
														"size-4",
														active ? "text-accent-text" : "text-fg-subtle",
													)}
												/>
												{item.label}
											</Link>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</nav>

				<div className="flex items-center gap-3 border-t border-border p-3">
					<span
						aria-hidden="true"
						className="flex size-8 shrink-0 items-center justify-center rounded-control bg-raised text-ui font-semibold text-fg-muted"
					>
						{initial}
					</span>
					<div className="min-w-0 flex-1">
						<p className="truncate text-ui font-medium text-fg">{userName}</p>
						<p className="truncate text-xs text-fg-subtle">{userEmail}</p>
					</div>
					<Button
						variant="quiet"
						size="sm"
						className="w-8 px-0"
						aria-label="Sign out"
						title="Sign out"
						onClick={handleSignOut}
						loading={signingOut}
					>
						{!signingOut && <LogOut aria-hidden="true" className="size-4" />}
					</Button>
				</div>
			</aside>

			<div className="min-w-0 flex-1">
				{banner}
				{error && (
					<p
						role="alert"
						className="border-b border-border bg-danger-subtle px-4 py-2.5 text-sm text-danger sm:px-6"
					>
						{error}
					</p>
				)}

				<main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
					{children}
				</main>
			</div>
		</div>
	);
}
