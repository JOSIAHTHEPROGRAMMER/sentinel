import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type NoticeTone = "danger" | "success" | "warning" | "neutral";

const tones: Record<NoticeTone, string> = {
	danger: "bg-danger-subtle text-danger",
	success: "bg-success-subtle text-success",
	warning: "bg-warning-subtle text-warning",
	neutral: "bg-raised text-fg-muted",
};

export function Notice({
	tone,
	children,
	className,
}: {
	tone: NoticeTone;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			role={tone === "danger" ? "alert" : "status"}
			className={cn(
				"rounded-control px-3 py-2 text-sm",
				tones[tone],
				className,
			)}
		>
			{children}
		</div>
	);
}
