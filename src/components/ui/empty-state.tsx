import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
	icon: LucideIcon;
	title: string;
	description?: string;
	action?: ReactNode;
};

export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
}: EmptyStateProps) {
	return (
		<div className="flex flex-col items-center px-6 py-12 text-center">
			<Icon aria-hidden="true" className="size-8 text-fg-subtle" />
			<h3 className="mt-3 text-sm font-semibold text-fg">{title}</h3>
			{description && (
				<p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>
			)}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}
