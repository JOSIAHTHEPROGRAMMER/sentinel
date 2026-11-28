"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type ModalProps = {
	open: boolean;
	onClose: () => void;
	title: string;
	description?: string;
	footer?: ReactNode;
	// False blocks Escape and backdrop clicks, for example while a request runs
	dismissible?: boolean;
	className?: string;
	children?: ReactNode;
};

export function Modal({
	open,
	onClose,
	title,
	description,
	footer,
	dismissible = true,
	className,
	children,
}: ModalProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const descriptionId = useId();

	useEffect(() => {
		const dialog = dialogRef.current;

		if (!dialog) {
			return;
		}

		if (open && !dialog.open) {
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	}, [open]);

	return (
		<dialog
			ref={dialogRef}
			aria-labelledby={titleId}
			aria-describedby={description ? descriptionId : undefined}
			onCancel={(event) => {
				// The parent owns the open state, so the browser must not close it
				event.preventDefault();

				if (dismissible) {
					onClose();
				}
			}}
			onClick={(event) => {
				if (dismissible && event.target === event.currentTarget) {
					onClose();
				}
			}}
			className={cn(
				"m-auto w-[calc(100%-2rem)] max-w-md rounded-panel border border-border bg-raised p-0 text-fg shadow-(--shadow-menu) backdrop:bg-black/60",
				className,
			)}
		>
			{open && (
				<div>
					<header className="flex items-start justify-between gap-4 px-5 pt-5">
						<div className="min-w-0">
							<h2 id={titleId} className="text-base font-semibold text-fg">
								{title}
							</h2>
							{description && (
								<p id={descriptionId} className="mt-1 text-sm text-fg-muted">
									{description}
								</p>
							)}
						</div>
						{dismissible && (
							<Button
								variant="quiet"
								size="sm"
								aria-label="Close"
								onClick={onClose}
								className="-mt-1 -mr-2 w-8 px-0"
							>
								<X aria-hidden="true" className="size-4" />
							</Button>
						)}
					</header>
					{children && <div className="px-5 py-4">{children}</div>}
					{footer && (
						<footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
							{footer}
						</footer>
					)}
				</div>
			)}
		</dialog>
	);
}

type ConfirmDialogProps = {
	open: boolean;
	title: string;
	description: string;
	confirmLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
	destructive?: boolean;
	loading?: boolean;
	error?: string | null;
	// Extra content, such as the password and email fields for account deletion
	children?: ReactNode;
};

// Replaces window.confirm: states the consequence and names the action
export function ConfirmDialog({
	open,
	title,
	description,
	confirmLabel,
	onConfirm,
	onCancel,
	destructive = false,
	loading = false,
	error,
	children,
}: ConfirmDialogProps) {
	return (
		<Modal
			open={open}
			onClose={onCancel}
			title={title}
			description={description}
			dismissible={!loading}
			footer={
				<>
					<Button variant="secondary" onClick={onCancel} disabled={loading}>
						Cancel
					</Button>
					<Button
						variant={destructive ? "danger" : "primary"}
						onClick={onConfirm}
						loading={loading}
					>
						{confirmLabel}
					</Button>
				</>
			}
		>
			{children}
			{error && (
				<p role="alert" className="text-ui text-danger">
					{error}
				</p>
			)}
		</Modal>
	);
}
