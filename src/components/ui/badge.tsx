import { CircleCheck, CircleMinus, CircleX, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "success" | "danger" | "warning" | "neutral";

const toneStyles: Record<BadgeTone, string> = {
	success: "bg-success-subtle text-success",
	danger: "bg-danger-subtle text-danger",
	warning: "bg-warning-subtle text-warning",
	neutral: "bg-neutral-subtle text-neutral",
};

// Each tone has its own icon shape, so status never relies on color alone
const toneIcons = {
	success: CircleCheck,
	danger: CircleX,
	warning: TriangleAlert,
	neutral: CircleMinus,
};

type BadgeProps = {
	tone: BadgeTone;
	children: ReactNode;
	className?: string;
};

export function Badge({ tone, children, className }: BadgeProps) {
	const Icon = toneIcons[tone];

	return (
		<span
			className={cn(
				"inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-xs font-medium",
				toneStyles[tone],
				className,
			)}
		>
			<Icon aria-hidden="true" className="size-3.5" />
			{children}
		</span>
	);
}
