import { cn } from "@/lib/cn";

// Decorative placeholder. The page that shows it should expose a loading
// state to assistive technology, for example with aria-busy on its container.
export function Skeleton({ className }: { className?: string }) {
	return (
		<div
			aria-hidden="true"
			className={cn("animate-pulse rounded-control bg-raised", className)}
		/>
	);
}
