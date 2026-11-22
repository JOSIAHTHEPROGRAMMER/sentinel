"use client";

import { useSearchParams } from "next/navigation";

export function DeletionScheduledNotice() {
	const searchParams = useSearchParams();

	if (searchParams.get("account") !== "deletion-scheduled") {
		return null;
	}

	return (
		<p
			role="status"
			className="mt-6 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm leading-6 text-amber-200"
		>
			Your account is scheduled for deletion. To keep it, sign in again before
			the deadline and choose Cancel deletion.
		</p>
	);
}
