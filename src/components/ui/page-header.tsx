import type { ReactNode } from "react";

type PageHeaderProps = {
	title: string;
	description?: string;
	// Shown above the title, for example a link back to the parent page
	back?: ReactNode;
	actions?: ReactNode;
};

export function PageHeader({
	title,
	description,
	back,
	actions,
}: PageHeaderProps) {
	return (
		<div className="space-y-2">
			{back && <div className="text-ui text-fg-muted">{back}</div>}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h1 className="truncate text-xl font-semibold text-fg">{title}</h1>
					{description && (
						<p className="mt-1 text-sm text-fg-muted">{description}</p>
					)}
				</div>
				{actions && (
					<div className="flex flex-wrap items-center gap-2">{actions}</div>
				)}
			</div>
		</div>
	);
}
