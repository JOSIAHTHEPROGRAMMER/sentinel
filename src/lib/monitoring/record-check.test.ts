import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	transaction: vi.fn(),
	insert: vi.fn(),
	checkValues: vi.fn(),
	incidentValues: vi.fn(),
	onConflictDoNothing: vi.fn(),
	update: vi.fn(),
	set: vi.fn(),
	where: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/worker", () => ({
	workerDb: {
		transaction: mocks.transaction,
	},
}));

import { checkResults, incidents } from "@/lib/db/schema/app";
import { recordMonitorCheck } from "./record-check";

const monitorId = "32bc70f6-c55f-4034-8bd7-f45bc84abab0";

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

beforeEach(() => {
	vi.clearAllMocks();

	const tx = {
		insert: mocks.insert,
		update: mocks.update,
	};

	mocks.transaction.mockImplementation(
		async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx),
	);

	mocks.insert.mockImplementation((table) =>
		table === checkResults
			? { values: mocks.checkValues }
			: { values: mocks.incidentValues },
	);

	mocks.checkValues.mockResolvedValue(undefined);
	mocks.incidentValues.mockReturnValue({
		onConflictDoNothing: mocks.onConflictDoNothing,
	});
	mocks.onConflictDoNothing.mockResolvedValue(undefined);

	mocks.update.mockReturnValue({ set: mocks.set });
	mocks.set.mockReturnValue({ where: mocks.where });
	mocks.where.mockResolvedValue(undefined);
});

describe("recordMonitorCheck", () => {
	it("records a successful check and resolves open incidents", async () => {
		await recordMonitorCheck({
			monitorId,
			result: successfulResult,
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
			resolvedAt: expect.any(Date),
		});
	});

	it("records a failed check and attempts to create an incident", async () => {
		await recordMonitorCheck({
			monitorId,
			result: failedResult,
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
			reason: "HTTP 503",
		});

		expect(mocks.onConflictDoNothing).toHaveBeenCalledWith(
			expect.objectContaining({
				target: incidents.monitorId,
			}),
		);
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
			reason: "Request timed out",
		});
	});

	it("uses conflict-safe insertion for repeated failures", async () => {
		await recordMonitorCheck({ monitorId, result: failedResult });
		await recordMonitorCheck({ monitorId, result: failedResult });

		expect(mocks.incidentValues).toHaveBeenCalledTimes(2);
		expect(mocks.onConflictDoNothing).toHaveBeenCalledTimes(2);
	});

	it("can record a later failure after a successful check", async () => {
		await recordMonitorCheck({
			monitorId,
			result: successfulResult,
		});

		await recordMonitorCheck({
			monitorId,
			result: failedResult,
		});

		expect(mocks.set).toHaveBeenCalledWith({
			resolvedAt: expect.any(Date),
		});

		expect(mocks.incidentValues).toHaveBeenCalledWith({
			monitorId,
			reason: "HTTP 503",
		});
	});
});
