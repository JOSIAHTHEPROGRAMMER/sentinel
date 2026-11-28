import { describe, expect, it, vi } from "vitest";
import { createRetentionRunner } from "./retention";

function setup(batches: Array<{ hoursRolled: number; rowsDeleted: number }>) {
	const runBatch = vi.fn();

	for (const batch of batches) {
		runBatch.mockResolvedValueOnce(batch);
	}

	runBatch.mockResolvedValue({ hoursRolled: 0, rowsDeleted: 0 });

	return { runBatch, onFinished: vi.fn(), onError: vi.fn() };
}

describe("createRetentionRunner", () => {
	it("repeats batches until one does nothing and reports the totals", async () => {
		const options = setup([
			{ hoursRolled: 168, rowsDeleted: 100 },
			{ hoursRolled: 40, rowsDeleted: 0 },
		]);
		const runner = createRetentionRunner(options);

		await runner.run();

		expect(options.runBatch).toHaveBeenCalledTimes(3);
		expect(options.onFinished).toHaveBeenCalledWith({
			hoursRolled: 208,
			rowsDeleted: 100,
			batches: 3,
			finished: true,
		});
	});

	it("stops at the batch cap and says it did not finish", async () => {
		const options = setup([]);

		options.runBatch.mockResolvedValue({ hoursRolled: 1, rowsDeleted: 0 });

		const runner = createRetentionRunner({ ...options, maxBatches: 3 });

		await runner.run();

		expect(options.runBatch).toHaveBeenCalledTimes(3);
		expect(options.onFinished).toHaveBeenCalledWith({
			hoursRolled: 3,
			rowsDeleted: 0,
			batches: 3,
			finished: false,
		});
	});

	it("stays quiet when there was nothing to do", async () => {
		const options = setup([]);
		const runner = createRetentionRunner(options);

		await runner.run();

		expect(options.runBatch).toHaveBeenCalledTimes(1);
		expect(options.onFinished).not.toHaveBeenCalled();
		expect(options.onError).not.toHaveBeenCalled();
	});

	it("routes a failure to onError without throwing", async () => {
		const options = setup([]);
		const failure = new Error("database down");

		options.runBatch.mockRejectedValue(failure);

		const runner = createRetentionRunner(options);

		await expect(runner.run()).resolves.toBeUndefined();
		expect(options.onError).toHaveBeenCalledWith(failure);
	});

	it("does not start a second run while one is in flight", async () => {
		const options = setup([]);
		let release: () => void = () => {};

		options.runBatch.mockImplementation(
			() =>
				new Promise((resolve) => {
					release = () => resolve({ hoursRolled: 0, rowsDeleted: 0 });
				}),
		);

		const runner = createRetentionRunner(options);
		const first = runner.run();
		const second = runner.run();

		expect(second).toBe(first);

		release();
		await first;

		// Once the first run has finished, a new run is allowed to start
		const third = runner.run();

		release();
		await third;

		expect(options.runBatch).toHaveBeenCalledTimes(2);
	});

	it("stops between batches when asked to", async () => {
		const options = setup([]);
		let stop = false;

		options.runBatch.mockImplementation(async () => {
			stop = true;

			return { hoursRolled: 168, rowsDeleted: 0 };
		});

		const runner = createRetentionRunner({
			...options,
			shouldStop: () => stop,
		});

		await runner.run();

		expect(options.runBatch).toHaveBeenCalledTimes(1);
	});
});
