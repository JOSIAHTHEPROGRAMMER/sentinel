import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkResults, incidents } from "@/lib/db/schema/app";
import type { HttpCheckResult } from "./http-check";

type RecordCheckInput = {
	monitorId: string;
	ownerId: string;
	result: HttpCheckResult;
};

export async function recordMonitorCheck({
	monitorId,
	ownerId,
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

	await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', '${ownerId}', true)`);

		await tx.insert(checkResults).values({
			monitorId,
			status,
			httpStatus: result.statusCode,
			latencyMs: result.responseTimeMs,
			errorMessage: result.success ? null : reason,
		});

		const openIncidents = await tx
			.select({ id: incidents.id })
			.from(incidents)
			.where(
				and(eq(incidents.monitorId, monitorId), isNull(incidents.resolvedAt)),
			);

		if (status === "up") {
			if (openIncidents.length > 0) {
				await tx
					.update(incidents)
					.set({ resolvedAt: new Date() })
					.where(
						and(
							eq(incidents.monitorId, monitorId),
							isNull(incidents.resolvedAt),
						),
					);
			}

			return;
		}

		if (openIncidents.length === 0) {
			await tx.insert(incidents).values({
				monitorId,
				reason,
			});
		}
	});
}
