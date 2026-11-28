import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type PanelProps = {
	title?: string;
	description?: string;
	actions?: ReactNode;
	// Content that manages its own padding, such as a table
	flush?: boolean;
	className?: string;
	children: ReactNode;
};

export function Panel({
	title,
	description,
	actions,
	flush = false,
	className,
	children,
}: PanelProps) {
	return (
		<section
			className={cn("rounded-panel border border-border bg-surface", className)}
		>
			{(title || actions) && (
				<header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
					<div className="min-w-0">
						{title && (
							<h2 className="text-sm font-semibold text-fg">{title}</h2>
						)}
						{description && (
							<p className="mt-0.5 text-ui text-fg-subtle">{description}</p>
						)}
					</div>
					{actions && <div className="flex items-center gap-2">{actions}</div>}
				</header>
			)}
			<div className={flush ? undefined : "p-4"}>{children}</div>
		</section>
	);
}
