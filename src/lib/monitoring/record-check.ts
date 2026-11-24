import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { checkResults, incidents, monitorState } from "@/lib/db/schema/app";
import { workerDb } from "@/lib/db/worker";
import type { HttpCheckResult } from "./http-check";
import {
	decideLifecycle,
	type LifecycleConfig,
	type StreakState,
} from "./incident-lifecycle";

type RecordCheckInput = {
	monitorId: string;
	result: HttpCheckResult;
	config: LifecycleConfig;
};

function toStreakState(row: typeof monitorState.$inferSelect): StreakState {
	return {
		consecutiveFailures: row.consecutiveFailures,
		consecutiveSuccesses: row.consecutiveSuccesses,
		failureStreakStartedAt: row.failureStreakStartedAt?.getTime() ?? null,
		successStreakStartedAt: row.successStreakStartedAt?.getTime() ?? null,
		failureReason: row.failureReason,
		lastCheckedAt: row.lastCheckedAt.getTime(),
	};
}

export async function recordMonitorCheck({
	monitorId,
	result,
	config,
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

	const checkedAt = new Date();

	await workerDb.transaction(async (tx) => {
		await tx.insert(checkResults).values({
			monitorId,
			checkedAt,
			status,
			httpStatus: result.statusCode,
			latencyMs: result.responseTimeMs,
			errorMessage: result.success ? null : reason,
		});

		// Locking the row keeps two overlapping checks from reading the same streak
		const [row] = await tx
			.select()
			.from(monitorState)
			.where(eq(monitorState.monitorId, monitorId))
			.for("update");

		const decision = decideLifecycle(
			row ? toStreakState(row) : null,
			{ success: result.success, checkedAt: checkedAt.getTime(), reason },
			config,
		);

		const { state } = decision;

		const stateValues = {
			consecutiveFailures: state.consecutiveFailures,
			consecutiveSuccesses: state.consecutiveSuccesses,
			failureStreakStartedAt:
				state.failureStreakStartedAt === null
					? null
					: new Date(state.failureStreakStartedAt),
			successStreakStartedAt:
				state.successStreakStartedAt === null
					? null
					: new Date(state.successStreakStartedAt),
			failureReason: state.failureReason,
			lastCheckedAt: new Date(state.lastCheckedAt),
		};

		await tx
			.insert(monitorState)
			.values({ monitorId, ...stateValues })
			.onConflictDoUpdate({
				target: monitorState.monitorId,
				set: stateValues,
			});

		if (decision.openIncident) {
			await tx
				.insert(incidents)
				.values({
					monitorId,
					startedAt: new Date(decision.openIncident.startedAt),
					reason: decision.openIncident.reason,
				})
				.onConflictDoNothing({
					target: incidents.monitorId,
					where: sql`resolved_at IS NULL`,
				});
		}

		if (decision.resolveIncident) {
			await tx
				.update(incidents)
				.set({ resolvedAt: new Date(decision.resolveIncident.resolvedAt) })
				.where(
					and(eq(incidents.monitorId, monitorId), isNull(incidents.resolvedAt)),
				);
		}
	});
}
