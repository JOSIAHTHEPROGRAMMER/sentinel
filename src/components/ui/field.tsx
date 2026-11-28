"use client";

import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "@/lib/cn";

type ControlProps = {
	id: string;
	"aria-describedby": string | undefined;
	"aria-invalid": true | undefined;
};

type FieldProps = {
	label: string;
	hint?: string;
	error?: string | null;
	required?: boolean;
	className?: string;
	children: (control: ControlProps) => ReactNode;
};

// The render prop hands the control its id and described-by wiring, so the
// label, hint and error are always connected without cloning elements
export function Field({
	label,
	hint,
	error,
	required,
	className,
	children,
}: FieldProps) {
	const id = useId();
	const hintId = `${id}-hint`;
	const errorId = `${id}-error`;
	const describedBy =
		[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
		undefined;

	return (
		<div className={cn("space-y-1.5", className)}>
			<label htmlFor={id} className="block text-ui font-medium text-fg">
				{label}
				{required && (
					<span aria-hidden="true" className="ml-0.5 text-fg-subtle">
						*
					</span>
				)}
			</label>
			{children({
				id,
				"aria-describedby": describedBy,
				"aria-invalid": error ? true : undefined,
			})}
			{hint && (
				<p id={hintId} className="text-ui text-fg-subtle">
					{hint}
				</p>
			)}
			{error && (
				<p id={errorId} role="alert" className="text-ui text-danger">
					{error}
				</p>
			)}
		</div>
	);
}

const controlBase =
	"w-full rounded-control border bg-surface text-sm text-fg placeholder:text-fg-subtle hover:border-border-strong focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50";

type InputProps = ComponentProps<"input"> & { invalid?: boolean };

export function Input({ invalid, className, ...props }: InputProps) {
	return (
		<input
			aria-invalid={invalid || undefined}
			className={cn(
				controlBase,
				"h-9 px-3",
				invalid ? "border-danger" : "border-border",
				className,
			)}
			{...props}
		/>
	);
}

type TextareaProps = ComponentProps<"textarea"> & { invalid?: boolean };

export function Textarea({ invalid, className, ...props }: TextareaProps) {
	return (
		<textarea
			aria-invalid={invalid || undefined}
			className={cn(
				controlBase,
				"min-h-24 px-3 py-2",
				invalid ? "border-danger" : "border-border",
				className,
			)}
			{...props}
		/>
	);
}
