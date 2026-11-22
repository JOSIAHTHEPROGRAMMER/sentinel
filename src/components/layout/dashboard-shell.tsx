"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

const navigation = [
	{ label: "Overview", href: "/dashboard", icon: "▣" },
	{ label: "Monitors", href: "/monitors", icon: "◎" },
	{ label: "Projects", href: "/projects", icon: "▦" },
	{ label: "Incidents", href: "/incidents", icon: "△" },
	{ label: "Settings", href: "/settings", icon: "⚙" },
];

type DashboardShellProps = {
	children: React.ReactNode;
	userName: string;
	userEmail: string;
	banner?: React.ReactNode;
};

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

	return (
		<div className="min-h-screen bg-slate-950 text-slate-100 md:flex">
			<aside className="flex w-full shrink-0 flex-col border-b border-white/10 bg-slate-950 md:min-h-screen md:w-64 md:border-r md:border-b-0">
				<div className="flex h-16 items-center gap-3 border-b border-white/10 px-6">
					<div className="flex size-9 items-center justify-center rounded-xl bg-cyan-400 font-bold text-slate-950">
						S
					</div>
					<div>
						<p className="font-semibold tracking-wide">Sentinel</p>
						<p className="text-xs text-slate-500">API Monitoring</p>
					</div>
				</div>

				<nav
					aria-label="Main navigation"
					className="flex gap-2 overflow-x-auto p-4 md:flex-1 md:flex-col"
				>
					{navigation.map((item) => {
						const active =
							item.href !== null &&
							(pathname === item.href ||
								(item.href !== "/dashboard" &&
									pathname.startsWith(`${item.href}/`)));

						const className = `flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
							active
								? "bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20"
								: "text-slate-400 hover:bg-white/5 hover:text-slate-200"
						}`;

						return item.href ? (
							<Link
								key={item.label}
								href={item.href}
								aria-current={active ? "page" : undefined}
								className={className}
							>
								<span aria-hidden="true" className="text-lg">
									{item.icon}
								</span>
								{item.label}
							</Link>
						) : (
							<div
								key={item.label}
								aria-disabled="true"
								title="Available in a later phase"
								className="flex shrink-0 cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600"
							>
								<span aria-hidden="true" className="text-lg">
									{item.icon}
								</span>
								<span>{item.label}</span>
								<span className="ml-auto text-xs">Soon</span>
							</div>
						);
					})}
				</nav>

				<div className="hidden border-t border-white/10 p-5 md:block">
					<p className="text-xs leading-5 text-slate-500">
						Monitor your endpoints. Detect issues. Keep your services reliable.
					</p>
				</div>
			</aside>

			<div className="min-w-0 flex-1">
				<header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3 sm:px-8">
					<p className="text-sm font-medium">Monitoring workspace</p>

					<div className="flex min-w-0 items-center gap-3">
						<div className="hidden min-w-0 text-right sm:block">
							<p className="truncate text-sm font-medium text-slate-200">
								{userName}
							</p>
							<p className="max-w-52 truncate text-xs text-slate-500">
								{userEmail}
							</p>
						</div>

						<button
							type="button"
							onClick={handleSignOut}
							disabled={signingOut}
							className="cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{signingOut ? "Signing out..." : "Sign out"}
						</button>
					</div>
				</header>
				{banner}
				{error && (
					<p
						role="alert"
						className="border-b border-red-500/20 bg-red-500/5 px-5 py-3 text-sm text-red-300 sm:px-8"
					>
						{error}
					</p>
				)}

				<main className="mx-auto w-full max-w-7xl p-5 sm:p-8">{children}</main>
			</div>
		</div>
	);
}
