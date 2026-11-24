import { staleThresholdMs } from "@/lib/data/staleness";

export type StreakState = {
	consecutiveFailures: number;
	consecutiveSuccesses: number;
	failureStreakStartedAt: number | null;
	successStreakStartedAt: number | null;
	failureReason: string | null;
	lastCheckedAt: number;
};

export type CheckOutcome = {
	success: boolean;
	checkedAt: number;
	reason: string;
};

export type LifecycleConfig = {
	failureThreshold: number;
	recoveryThreshold: number;
	intervalSeconds: number;
};

export type LifecycleDecision = {
	state: StreakState;
	openIncident: { startedAt: number; reason: string } | null;
	resolveIncident: { resolvedAt: number } | null;
};

export function decideLifecycle(
	previous: StreakState | null,
	outcome: CheckOutcome,
	config: LifecycleConfig,
): LifecycleDecision {
	// A long gap (disabled monitor, worker downtime) breaks the streak, because
	// two failures separated by an outage of Sentinel itself are not consecutive
	const active =
		previous &&
		outcome.checkedAt - previous.lastCheckedAt <=
			staleThresholdMs(config.intervalSeconds)
			? previous
			: null;

	if (outcome.success) {
		const continuing = (active?.consecutiveSuccesses ?? 0) > 0;
		const consecutiveSuccesses = (active?.consecutiveSuccesses ?? 0) + 1;
		const successStreakStartedAt =
			continuing && active?.successStreakStartedAt != null
				? active.successStreakStartedAt
				: outcome.checkedAt;

		return {
			state: {
				consecutiveFailures: 0,
				consecutiveSuccesses,
				failureStreakStartedAt: null,
				successStreakStartedAt,
				failureReason: null,
				lastCheckedAt: outcome.checkedAt,
			},
			openIncident: null,
			// Back-dated to the first success of the recovering streak
			resolveIncident:
				consecutiveSuccesses >= config.recoveryThreshold
					? { resolvedAt: successStreakStartedAt }
					: null,
		};
	}

	const continuing = (active?.consecutiveFailures ?? 0) > 0;
	const consecutiveFailures = (active?.consecutiveFailures ?? 0) + 1;
	const failureStreakStartedAt =
		continuing && active?.failureStreakStartedAt != null
			? active.failureStreakStartedAt
			: outcome.checkedAt;
	// The reason from the first failure explains how the outage began
	const failureReason =
		continuing && active?.failureReason != null
			? active.failureReason
			: outcome.reason;

	return {
		state: {
			consecutiveFailures,
			consecutiveSuccesses: 0,
			failureStreakStartedAt,
			successStreakStartedAt: null,
			failureReason,
			lastCheckedAt: outcome.checkedAt,
		},
		// Back-dated to the first failure of the streak
		openIncident:
			consecutiveFailures >= config.failureThreshold
				? { startedAt: failureStreakStartedAt, reason: failureReason }
				: null,
		resolveIncident: null,
	};
}
