import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { checkResults, incidents } from "@/lib/db/schema/app";
import { workerDb } from "@/lib/db/worker";
import type { HttpCheckResult } from "./http-check";

type RecordCheckInput = {
	monitorId: string;
	result: HttpCheckResult;
};

export async function recordMonitorCheck({
	monitorId,
	result,
}: RecordCheckInput): Promise<void> {
	const status = result.success
		? "up"
		: result.error?.toLowerCase().includes("timed out")
			? "timeout"
			: "down";

	const reason =
		result.error ??
		(result.statusCode !== null
			? `HTTP ${result.statusCode}`
			: "HTTP check failed");

	await workerDb.transaction(async (tx) => {
		await tx.insert(checkResults).values({
			monitorId,
			status,
			httpStatus: result.statusCode,
			latencyMs: result.responseTimeMs,
			errorMessage: result.success ? null : reason,
		});

		if (status === "up") {
			await tx
				.update(incidents)
				.set({ resolvedAt: new Date() })
				.where(
					and(eq(incidents.monitorId, monitorId), isNull(incidents.resolvedAt)),
				);

			return;
		}

		await tx
			.insert(incidents)
			.values({ monitorId, reason })
			.onConflictDoNothing({
				target: incidents.monitorId,
				where: sql`resolved_at IS NULL`,
			});
	});
}
