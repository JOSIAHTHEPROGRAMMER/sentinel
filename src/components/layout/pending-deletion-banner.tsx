"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LocalDate } from "@/components/ui/local-date";

type PendingDeletionBannerProps = {
	purgeAfter: string;
};

export function PendingDeletionBanner({
	purgeAfter,
}: PendingDeletionBannerProps) {
	const router = useRouter();
	const [cancelling, setCancelling] = useState(false);
	const [error, setError] = useState("");

	async function handleCancel() {
		setCancelling(true);
		setError("");

		try {
			const response = await fetch("/api/account/deletion", {
				method: "DELETE",
			});

			if (!response.ok) {
				const data: { error?: string } = await response.json();

				throw new Error(data.error ?? "Unable to cancel the deletion.");
			}

			// Re-runs the server layout, which removes the banner
			router.refresh();
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Something went wrong. Please try again.",
			);
			setCancelling(false);
		}
	}

	return (
		<section
			role="alert"
			className="border-b border-border bg-warning-subtle px-4 py-3 sm:px-6"
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="flex items-start gap-2.5 text-sm text-fg">
					<TriangleAlert
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0 text-warning"
					/>
					<span>
						Your account is scheduled for deletion on{" "}
						<LocalDate value={purgeAfter} />. All your monitors, history and
						settings will be permanently removed then.
					</span>
				</p>

				<Button
					variant="secondary"
					size="sm"
					onClick={handleCancel}
					loading={cancelling}
					className="self-start sm:self-center"
				>
					Cancel deletion
				</Button>
			</div>

			{error && <p className="mt-2 text-ui text-danger">{error}</p>}
		</section>
	);
}
