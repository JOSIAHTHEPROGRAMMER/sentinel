import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	transaction: vi.fn(),
	insert: vi.fn(),
	select: vi.fn(),
	update: vi.fn(),
	checkValues: vi.fn(),
	stateValues: vi.fn(),
	stateOnConflict: vi.fn(),
	incidentValues: vi.fn(),
	incidentOnConflict: vi.fn(),
	selectFor: vi.fn(),
	set: vi.fn(),
	where: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/worker", () => ({
	workerDb: {
		transaction: mocks.transaction,
	},
}));

import { checkResults, incidents, monitorState } from "@/lib/db/schema/app";
import { recordMonitorCheck } from "./record-check";

const monitorId = "32bc70f6-c55f-4034-8bd7-f45bc84abab0";
const NOW = Date.UTC(2026, 10, 22, 12, 0, 0);
const msAgo = (ms: number) => new Date(NOW - ms);
const MINUTE = 60_000;

// Thresholds of 1 reproduce the behavior from before thresholds existed
const defaultConfig = {
	failureThreshold: 1,
	recoveryThreshold: 1,
	intervalSeconds: 300,
};

const successfulResult = {
	success: true,
	statusCode: 200,
	responseTimeMs: 42,
	finalUrl: "https://example.com/",
};

const failedResult = {
	success: false,
	statusCode: 503,
	responseTimeMs: 85,
	finalUrl: "https://example.com/",
	error: "HTTP 503",
};

function stateRow(overrides: Record<string, unknown> = {}) {
	return {
		monitorId,
		consecutiveFailures: 0,
		consecutiveSuccesses: 0,
		failureStreakStartedAt: null,
		successStreakStartedAt: null,
		failureReason: null,
		lastCheckedAt: msAgo(MINUTE),
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);

	const tx = {
		insert: mocks.insert,
		select: mocks.select,
		update: mocks.update,
	};

	mocks.transaction.mockImplementation(
		async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx),
	);

	mocks.insert.mockImplementation((table) => {
		if (table === checkResults) {
			return { values: mocks.checkValues };
		}

		if (table === monitorState) {
			return { values: mocks.stateValues };
		}

		return { values: mocks.incidentValues };
	});

	mocks.checkValues.mockResolvedValue(undefined);

	mocks.stateValues.mockReturnValue({
		onConflictDoUpdate: mocks.stateOnConflict,
	});
	mocks.stateOnConflict.mockResolvedValue(undefined);

	mocks.incidentValues.mockReturnValue({
		onConflictDoNothing: mocks.incidentOnConflict,
	});
	mocks.incidentOnConflict.mockResolvedValue(undefined);

	mocks.select.mockReturnValue({
		from: () => ({ where: () => ({ for: mocks.selectFor }) }),
	});
	mocks.selectFor.mockResolvedValue([]);

	mocks.update.mockReturnValue({ set: mocks.set });
	mocks.set.mockReturnValue({ where: mocks.where });
	mocks.where.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("recordMonitorCheck with default thresholds", () => {
	it("records a successful check and resolves open incidents", async () => {
		await recordMonitorCheck({
			monitorId,
			result: successfulResult,
			config: defaultConfig,
		});

		expect(mocks.checkValues).toHaveBeenCalledWith(
			expect.objectContaining({
				monitorId,
				status: "up",
				httpStatus: 200,
				latencyMs: 42,
				errorMessage: null,
			}),
		);

		expect(mocks.update).toHaveBeenCalledWith(incidents);
		expect(mocks.set).toHaveBeenCalledWith({
			resolvedAt: new Date(NOW),
		});
		expect(mocks.incidentValues).not.toHaveBeenCalled();
	});

	it("records a failed check and opens an incident immediately", async () => {
		await recordMonitorCheck({
			monitorId,
			result: failedResult,
			config: defaultConfig,
		});

		expect(mocks.checkValues).toHaveBeenCalledWith(
			expect.objectContaining({
				monitorId,
				status: "down",
				httpStatus: 503,
				errorMessage: "HTTP 503",
			}),
		);

		expect(mocks.incidentValues).toHaveBeenCalledWith({
			monitorId,
			startedAt: new Date(NOW),
			reason: "HTTP 503",
		});

		expect(mocks.incidentOnConflict).toHaveBeenCalledWith(
			expect.objectContaining({
				target: incidents.monitorId,
			}),
		);
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it("records timeouts with the timeout status", async () => {
		await recordMonitorCheck({
			monitorId,
			result: {
				success: false,
				statusCode: null,
				responseTimeMs: 10_000,
				finalUrl: "https://example.com/",
				error: "Request timed out",
			},
			config: defaultConfig,
		});

		expect(mocks.checkValues).toHaveBeenCalledWith(
			expect.objectContaining({
				monitorId,
				status: "timeout",
				errorMessage: "Request timed out",
			}),
		);

		expect(mocks.incidentValues).toHaveBeenCalledWith({
			monitorId,
			startedAt: new Date(NOW),
			reason: "Request timed out",
		});
	});

	it("uses conflict-safe insertion for repeated failures", async () => {
		mocks.selectFor.mockResolvedValue([
			stateRow({
				consecutiveFailures: 1,
				failureStreakStartedAt: msAgo(MINUTE),
				failureReason: "HTTP 503",
			}),
		]);

		await recordMonitorCheck({
			monitorId,
			result: failedResult,
			config: defaultConfig,
		});
		await recordMonitorCheck({
			monitorId,
			result: failedResult,
			config: defaultConfig,
		});

		expect(mocks.incidentValues).toHaveBeenCalledTimes(2);
		expect(mocks.incidentOnConflict).toHaveBeenCalledTimes(2);
	});

	it("keeps the original start time while an outage continues", async () => {
		mocks.selectFor.mockResolvedValue([
			stateRow({
				consecutiveFailures: 4,
				failureStreakStartedAt: msAgo(4 * MINUTE),
				failureReason: "HTTP 500",
			}),
		]);

		await recordMonitorCheck({
			monitorId,
			result: failedResult,
			config: { ...defaultConfig, intervalSeconds: 60 },
		});

		expect(mocks.incidentValues).toHaveBeenCalledWith({
			monitorId,
			startedAt: msAgo(4 * MINUTE),
			reason: "HTTP 500",
		});
	});

	it("can record a later failure after a successful check", async () => {
		await recordMonitorCheck({
			monitorId,
			result: successfulResult,
			config: defaultConfig,
		});

		await recordMonitorCheck({
			monitorId,
			result: failedResult,
			config: defaultConfig,
		});

		expect(mocks.set).toHaveBeenCalledWith({
			resolvedAt: new Date(NOW),
		});

		expect(mocks.incidentValues).toHaveBeenCalledWith({
			monitorId,
			startedAt: new Date(NOW),
			reason: "HTTP 503",
		});
	});
});

describe("recordMonitorCheck with a failure threshold", () => {
	const config = {
		failureThreshold: 3,
		recoveryThreshold: 1,
		intervalSeconds: 60,
	};

	it("does not open an incident for the first failure", async () => {
		await recordMonitorCheck({ monitorId, result: failedResult, config });

		expect(mocks.checkValues).toHaveBeenCalledOnce();
		expect(mocks.incidentValues).not.toHaveBeenCalled();
		expect(mocks.stateValues).toHaveBeenCalledWith(
			expect.objectContaining({
				monitorId,
				consecutiveFailures: 1,
				failureReason: "HTTP 503",
			}),
		);
	});

	it("does not open an incident below the threshold", async () => {
		mocks.selectFor.mockResolvedValue([
			stateRow({
				consecutiveFailures: 1,
				failureStreakStartedAt: msAgo(MINUTE),
				failureReason: "HTTP 503",
			}),
		]);

		await recordMonitorCheck({ monitorId, result: failedResult, config });

		expect(mocks.incidentValues).not.toHaveBeenCalled();
		expect(mocks.stateValues).toHaveBeenCalledWith(
			expect.objectContaining({ consecutiveFailures: 2 }),
		);
	});

	it("opens an incident at the threshold, back-dated to the first failure", async () => {
		mocks.selectFor.mockResolvedValue([
			stateRow({
				consecutiveFailures: 2,
				failureStreakStartedAt: msAgo(2 * MINUTE),
				failureReason: "HTTP 503",
				lastCheckedAt: msAgo(MINUTE),
			}),
		]);

		await recordMonitorCheck({
			monitorId,
			result: { ...failedResult, error: "HTTP 502" },
			config,
		});

		expect(mocks.incidentValues).toHaveBeenCalledWith({
			monitorId,
			startedAt: msAgo(2 * MINUTE),
			reason: "HTTP 503",
		});
	});

	it("starts a new streak when the gap since the last check is too long", async () => {
		mocks.selectFor.mockResolvedValue([
			stateRow({
				consecutiveFailures: 2,
				failureStreakStartedAt: msAgo(12 * MINUTE),
				failureReason: "HTTP 503",
				lastCheckedAt: msAgo(10 * MINUTE),
			}),
		]);

		await recordMonitorCheck({ monitorId, result: failedResult, config });

		expect(mocks.incidentValues).not.toHaveBeenCalled();
		expect(mocks.stateValues).toHaveBeenCalledWith(
			expect.objectContaining({
				consecutiveFailures: 1,
				failureStreakStartedAt: new Date(NOW),
			}),
		);
	});

	it("resets the failure count after a success", async () => {
		mocks.selectFor.mockResolvedValue([
			stateRow({
				consecutiveFailures: 2,
				failureStreakStartedAt: msAgo(2 * MINUTE),
				failureReason: "HTTP 503",
			}),
		]);

		await recordMonitorCheck({ monitorId, result: successfulResult, config });

		expect(mocks.stateValues).toHaveBeenCalledWith(
			expect.objectContaining({
				consecutiveFailures: 0,
				consecutiveSuccesses: 1,
				failureStreakStartedAt: null,
				failureReason: null,
			}),
		);
		expect(mocks.incidentValues).not.toHaveBeenCalled();
	});
});

describe("recordMonitorCheck with a recovery threshold", () => {
	const config = {
		failureThreshold: 1,
		recoveryThreshold: 2,
		intervalSeconds: 60,
	};

	it("does not resolve after the first success", async () => {
		mocks.selectFor.mockResolvedValue([
			stateRow({
				consecutiveFailures: 3,
				failureStreakStartedAt: msAgo(3 * MINUTE),
				failureReason: "HTTP 503",
			}),
		]);

		await recordMonitorCheck({ monitorId, result: successfulResult, config });

		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.stateValues).toHaveBeenCalledWith(
			expect.objectContaining({
				consecutiveSuccesses: 1,
				successStreakStartedAt: new Date(NOW),
			}),
		);
	});

	it("resolves at the threshold, back-dated to the first success", async () => {
		mocks.selectFor.mockResolvedValue([
			stateRow({
				consecutiveSuccesses: 1,
				successStreakStartedAt: msAgo(MINUTE),
				lastCheckedAt: msAgo(MINUTE),
			}),
		]);

		await recordMonitorCheck({ monitorId, result: successfulResult, config });

		expect(mocks.update).toHaveBeenCalledWith(incidents);
		expect(mocks.set).toHaveBeenCalledWith({ resolvedAt: msAgo(MINUTE) });
	});

	it("does not resolve when a failure interrupts the recovery", async () => {
		mocks.selectFor.mockResolvedValue([
			stateRow({
				consecutiveSuccesses: 1,
				successStreakStartedAt: msAgo(MINUTE),
			}),
		]);

		await recordMonitorCheck({ monitorId, result: failedResult, config });

		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.stateValues).toHaveBeenCalledWith(
			expect.objectContaining({
				consecutiveSuccesses: 0,
				successStreakStartedAt: null,
				consecutiveFailures: 1,
			}),
		);
	});

	it("starts a new success streak after a long gap", async () => {
		mocks.selectFor.mockResolvedValue([
			stateRow({
				consecutiveSuccesses: 1,
				successStreakStartedAt: msAgo(30 * MINUTE),
				lastCheckedAt: msAgo(30 * MINUTE),
			}),
		]);

		await recordMonitorCheck({ monitorId, result: successfulResult, config });

		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.stateValues).toHaveBeenCalledWith(
			expect.objectContaining({ consecutiveSuccesses: 1 }),
		);
	});
});

describe("recordMonitorCheck state handling", () => {
	it("locks the monitor's state row before deciding", async () => {
		await recordMonitorCheck({
			monitorId,
			result: successfulResult,
			config: defaultConfig,
		});

		expect(mocks.selectFor).toHaveBeenCalledWith("update");
	});

	it("upserts the state for the monitor on every check", async () => {
		await recordMonitorCheck({
			monitorId,
			result: successfulResult,
			config: defaultConfig,
		});

		expect(mocks.stateValues).toHaveBeenCalledWith(
			expect.objectContaining({
				monitorId,
				lastCheckedAt: new Date(NOW),
			}),
		);
		expect(mocks.stateOnConflict).toHaveBeenCalledWith(
			expect.objectContaining({
				target: monitorState.monitorId,
				set: expect.objectContaining({ lastCheckedAt: new Date(NOW) }),
			}),
		);
	});

	it("stores the check time on the check result", async () => {
		await recordMonitorCheck({
			monitorId,
			result: successfulResult,
			config: defaultConfig,
		});

		expect(mocks.checkValues).toHaveBeenCalledWith(
			expect.objectContaining({ checkedAt: new Date(NOW) }),
		);
	});

	it("does all of its writes in one transaction", async () => {
		await recordMonitorCheck({
			monitorId,
			result: failedResult,
			config: defaultConfig,
		});

		expect(mocks.transaction).toHaveBeenCalledOnce();
	});
});
