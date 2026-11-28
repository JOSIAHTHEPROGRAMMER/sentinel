import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md";

const base =
	"inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
	primary: "bg-accent text-accent-fg hover:bg-accent-hover",
	secondary:
		"border border-border bg-surface text-fg hover:border-border-strong hover:bg-raised",
	quiet: "text-fg-muted hover:bg-raised hover:text-fg",
	danger:
		"border border-border bg-surface text-danger hover:border-danger hover:bg-danger-subtle",
};

const sizes: Record<ButtonSize, string> = {
	sm: "h-8 px-3 text-ui",
	md: "h-9 px-4 text-sm",
};

type ButtonStyleOptions = {
	variant?: ButtonVariant;
	size?: ButtonSize;
	className?: string;
};

// Exported so links can look like buttons without a second set of styles
export function buttonStyles({
	variant = "secondary",
	size = "md",
	className,
}: ButtonStyleOptions = {}): string {
	return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> &
	Omit<ButtonStyleOptions, "className"> & {
		loading?: boolean;
	};

export function Button({
	variant,
	size,
	loading = false,
	className,
	disabled,
	children,
	type = "button",
	...props
}: ButtonProps) {
	return (
		<button
			type={type}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			className={buttonStyles({ variant, size, className })}
			{...props}
		>
			{loading && (
				<Loader2 aria-hidden="true" className="size-4 animate-spin" />
			)}
			{children}
		</button>
	);
}
