"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
			className="border-b border-amber-400/20 bg-amber-400/5 px-5 py-3 sm:px-8"
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-sm text-amber-200">
					Your account is scheduled for deletion on{" "}
					<LocalDate value={purgeAfter} />. All your monitors, history and
					settings will be permanently removed then.
				</p>

				<button
					type="button"
					onClick={handleCancel}
					disabled={cancelling}
					className="cursor-pointer self-start rounded-lg border border-amber-400/30 px-3 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50 sm:self-center"
				>
					{cancelling ? "Cancelling..." : "Cancel deletion"}
				</button>
			</div>

			{error && <p className="mt-2 text-xs text-red-300">{error}</p>}
		</section>
	);
}
