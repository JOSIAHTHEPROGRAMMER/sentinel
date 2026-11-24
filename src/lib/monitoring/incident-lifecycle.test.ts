import { describe, expect, it } from "vitest";
import {
	type CheckOutcome,
	decideLifecycle,
	type LifecycleConfig,
	type LifecycleDecision,
	type StreakState,
} from "./incident-lifecycle";

const T0 = Date.UTC(2026, 10, 22, 12, 0, 0);
const minute = (value: number) => T0 + value * 60_000;

// A 60 second interval gives a gap threshold of exactly 3 minutes
const config: LifecycleConfig = {
	failureThreshold: 3,
	recoveryThreshold: 2,
	intervalSeconds: 60,
};

const defaults: LifecycleConfig = {
	failureThreshold: 1,
	recoveryThreshold: 1,
	intervalSeconds: 300,
};

type Step = { success: boolean; at: number; reason?: string };

function play(steps: Step[], lifecycle: LifecycleConfig = config) {
	let state: StreakState | null = null;
	const decisions: LifecycleDecision[] = [];

	for (const step of steps) {
		const outcome: CheckOutcome = {
			success: step.success,
			checkedAt: step.at,
			reason: step.reason ?? "HTTP 503",
		};
		const decision: LifecycleDecision = decideLifecycle(
			state,
			outcome,
			lifecycle,
		);

		decisions.push(decision);
		state = decision.state;
	}

	return decisions;
}

const fail = (at: number, reason?: string): Step => ({
	success: false,
	at,
	reason,
});
const pass = (at: number): Step => ({ success: true, at });

describe("default thresholds reproduce the original behavior", () => {
	it("opens an incident on the first failure", () => {
		const [decision] = play([fail(minute(0), "HTTP 500")], defaults);

		expect(decision?.openIncident).toEqual({
			startedAt: minute(0),
			reason: "HTTP 500",
		});
		expect(decision?.resolveIncident).toBeNull();
	});

	it("resolves on the first success", () => {
		const decisions = play([fail(minute(0)), pass(minute(1))], defaults);

		expect(decisions[1]?.resolveIncident).toEqual({ resolvedAt: minute(1) });
		expect(decisions[1]?.openIncident).toBeNull();
	});

	it("keeps attempting to open while failures continue", () => {
		const decisions = play([fail(minute(0)), fail(minute(1))], defaults);

		expect(decisions[1]?.openIncident).toEqual({
			startedAt: minute(0),
			reason: "HTTP 503",
		});
	});
});

describe("failure threshold", () => {
	it("does not open an incident below the threshold", () => {
		const decisions = play([fail(minute(0)), fail(minute(1))]);

		expect(decisions[0]?.openIncident).toBeNull();
		expect(decisions[1]?.openIncident).toBeNull();
		expect(decisions[1]?.state.consecutiveFailures).toBe(2);
	});

	it("opens at exactly the threshold, back-dated to the first failure", () => {
		const decisions = play([
			fail(minute(0), "HTTP 503"),
			fail(minute(1), "HTTP 502"),
			fail(minute(2), "Request timed out"),
		]);

		expect(decisions[2]?.openIncident).toEqual({
			startedAt: minute(0),
			reason: "HTTP 503",
		});
	});

	it("keeps the original start and reason while the outage continues", () => {
		const decisions = play([
			fail(minute(0), "HTTP 503"),
			fail(minute(1), "HTTP 502"),
			fail(minute(2), "HTTP 500"),
			fail(minute(3), "HTTP 504"),
		]);

		expect(decisions[3]?.openIncident).toEqual({
			startedAt: minute(0),
			reason: "HTTP 503",
		});
		expect(decisions[3]?.state.consecutiveFailures).toBe(4);
	});

	it("resets the failure count after a success", () => {
		const decisions = play([
			fail(minute(0)),
			fail(minute(1)),
			pass(minute(2)),
			fail(minute(3)),
		]);

		expect(decisions[3]?.state.consecutiveFailures).toBe(1);
		expect(decisions[3]?.state.failureStreakStartedAt).toBe(minute(3));
		expect(decisions[3]?.openIncident).toBeNull();
	});

	it("starts the next streak with its own reason", () => {
		const decisions = play([
			fail(minute(0), "HTTP 503"),
			pass(minute(1)),
			fail(minute(2), "Request timed out"),
		]);

		expect(decisions[2]?.state.failureReason).toBe("Request timed out");
	});
});

describe("recovery threshold", () => {
	const outage = [
		fail(minute(0), "HTTP 503"),
		fail(minute(1)),
		fail(minute(2)),
	];

	it("does not resolve before enough consecutive successes", () => {
		const decisions = play([...outage, pass(minute(3))]);

		expect(decisions[3]?.resolveIncident).toBeNull();
		expect(decisions[3]?.state.consecutiveSuccesses).toBe(1);
	});

	it("resolves at exactly the threshold, back-dated to the first success", () => {
		const decisions = play([...outage, pass(minute(3)), pass(minute(4))]);

		expect(decisions[4]?.resolveIncident).toEqual({ resolvedAt: minute(3) });
	});

	it("restarts the success streak when a failure interrupts it", () => {
		const decisions = play([
			...outage,
			pass(minute(3)),
			fail(minute(4)),
			pass(minute(5)),
		]);

		expect(decisions[4]?.state.consecutiveSuccesses).toBe(0);
		expect(decisions[4]?.state.successStreakStartedAt).toBeNull();
		expect(decisions[5]?.state.consecutiveSuccesses).toBe(1);
		expect(decisions[5]?.resolveIncident).toBeNull();
	});

	it("does not reopen an incident from a failure inside the recovery window", () => {
		const decisions = play([...outage, pass(minute(3)), fail(minute(4))]);

		expect(decisions[4]?.state.consecutiveFailures).toBe(1);
		expect(decisions[4]?.openIncident).toBeNull();
	});
});

describe("gaps between checks", () => {
	it("restarts a failure streak after a long gap", () => {
		const decisions = play([
			fail(minute(0)),
			fail(minute(1)),
			fail(minute(10)),
		]);

		expect(decisions[2]?.state.consecutiveFailures).toBe(1);
		expect(decisions[2]?.state.failureStreakStartedAt).toBe(minute(10));
		expect(decisions[2]?.openIncident).toBeNull();
	});

	it("restarts a success streak after a long gap", () => {
		const decisions = play([
			fail(minute(0)),
			fail(minute(1)),
			fail(minute(2)),
			pass(minute(3)),
			pass(minute(20)),
		]);

		expect(decisions[4]?.state.consecutiveSuccesses).toBe(1);
		expect(decisions[4]?.resolveIncident).toBeNull();
	});

	it("treats a gap exactly at the threshold as consecutive", () => {
		const decisions = play([fail(minute(0)), fail(minute(3))]);

		expect(decisions[1]?.state.consecutiveFailures).toBe(2);
	});

	it("treats a gap one millisecond over the threshold as a new streak", () => {
		const decisions = play([fail(minute(0)), fail(minute(3) + 1)]);

		expect(decisions[1]?.state.consecutiveFailures).toBe(1);
	});

	it("starts fresh when there is no previous state", () => {
		const [decision] = play([fail(minute(0))]);

		expect(decision?.state).toEqual({
			consecutiveFailures: 1,
			consecutiveSuccesses: 0,
			failureStreakStartedAt: minute(0),
			successStreakStartedAt: null,
			failureReason: "HTTP 503",
			lastCheckedAt: minute(0),
		});
	});
});

describe("state bookkeeping", () => {
	it("clears failure data on success and success data on failure", () => {
		const decisions = play([fail(minute(0)), pass(minute(1)), fail(minute(2))]);

		expect(decisions[1]?.state).toMatchObject({
			consecutiveFailures: 0,
			failureStreakStartedAt: null,
			failureReason: null,
			consecutiveSuccesses: 1,
			successStreakStartedAt: minute(1),
		});
		expect(decisions[2]?.state).toMatchObject({
			consecutiveSuccesses: 0,
			successStreakStartedAt: null,
			consecutiveFailures: 1,
		});
	});

	it("always records the time of the latest check", () => {
		const decisions = play([pass(minute(0)), fail(minute(1)), pass(minute(2))]);

		expect(decisions.map((decision) => decision.state.lastCheckedAt)).toEqual([
			minute(0),
			minute(1),
			minute(2),
		]);
	});

	it("never opens and resolves in the same decision", () => {
		const decisions = play([
			fail(minute(0)),
			fail(minute(1)),
			fail(minute(2)),
			pass(minute(3)),
			pass(minute(4)),
		]);

		for (const decision of decisions) {
			expect(
				decision.openIncident !== null && decision.resolveIncident !== null,
			).toBe(false);
		}
	});
});
