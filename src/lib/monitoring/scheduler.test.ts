import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { createMonitorScheduler, type ScheduledMonitor } from "./scheduler";

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;

	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

const monitor: ScheduledMonitor = {
	id: "monitor-1",
	intervalSeconds: 60,
};

describe("monitor scheduler", () => {
	let now: number;
	let eligibleMonitors: ScheduledMonitor[];

	let getEligibleMonitors: Mock<() => Promise<ScheduledMonitor[]>>;

	let runCheck: Mock<(monitorId: string) => Promise<void>>;

	let onError: Mock<(message: string, error: unknown) => void>;

	beforeEach(() => {
		now = 1_000;
		eligibleMonitors = [{ ...monitor }];

		getEligibleMonitors = vi.fn(
			async (): Promise<ScheduledMonitor[]> => eligibleMonitors,
		);

		runCheck = vi.fn(async (_monitorId: string): Promise<void> => {});

		onError = vi.fn((_message: string, _error: unknown): void => {});
	});

	function createScheduler() {
		return createMonitorScheduler({
			getEligibleMonitors,
			runCheck,
			now: () => now,
			onError,
		});
	}

	it("runs a check when a monitor is due", async () => {
		const scheduler = createScheduler();

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledOnce();
		expect(runCheck).toHaveBeenCalledWith("monitor-1");
	});

	it("respects the configured interval", async () => {
		const scheduler = createScheduler();

		await scheduler.poll();
		await scheduler.waitForIdle();

		now += 59_000;
		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledOnce();

		now += 1_000;
		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledTimes(2);
	});

	it("does not start another check while one is running", async () => {
		const pendingCheck = deferred<void>();
		runCheck.mockReturnValue(pendingCheck.promise);

		const scheduler = createScheduler();

		await scheduler.poll();
		expect(runCheck).toHaveBeenCalledOnce();

		now += 60_000;
		await scheduler.poll();

		expect(runCheck).toHaveBeenCalledOnce();

		pendingCheck.resolve();
		await scheduler.waitForIdle();
	});

	it("logs a failed check and continues scheduling", async () => {
		runCheck.mockRejectedValueOnce(new Error("Network failure"));

		const scheduler = createScheduler();

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(onError).toHaveBeenCalledWith(
			"Monitor check failed for monitor-1:",
			expect.any(Error),
		);

		now += 60_000;
		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledTimes(2);
	});

	it("removes monitors that are no longer eligible", async () => {
		const scheduler = createScheduler();

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledOnce();

		eligibleMonitors = [];
		await scheduler.poll();

		eligibleMonitors = [{ ...monitor }];
		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledTimes(2);
	});

	it("stops scheduling and waits for active checks to finish", async () => {
		const pendingCheck = deferred<void>();
		runCheck.mockReturnValue(pendingCheck.promise);

		const scheduler = createScheduler();

		await scheduler.poll();
		expect(runCheck).toHaveBeenCalledOnce();

		scheduler.stop();

		await scheduler.poll();
		expect(runCheck).toHaveBeenCalledOnce();

		let finished = false;

		const idlePromise = scheduler.waitForIdle().then(() => {
			finished = true;
		});

		await Promise.resolve();
		expect(finished).toBe(false);

		pendingCheck.resolve();
		await idlePromise;

		expect(finished).toBe(true);
	});

	it("logs database polling errors and recovers on the next poll", async () => {
		getEligibleMonitors.mockRejectedValueOnce(
			new Error("Database unavailable"),
		);

		const scheduler = createScheduler();

		await scheduler.poll();

		expect(onError).toHaveBeenCalledWith(
			"Monitor scheduling failed:",
			expect.any(Error),
		);

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledOnce();
	});

	it("prevents overlapping scheduler polls", async () => {
		const pendingQuery = deferred<ScheduledMonitor[]>();

		getEligibleMonitors.mockReturnValueOnce(pendingQuery.promise);

		const scheduler = createScheduler();

		const firstPoll = scheduler.poll();

		await scheduler.poll();

		expect(getEligibleMonitors).toHaveBeenCalledOnce();

		pendingQuery.resolve([{ ...monitor }]);

		await firstPoll;
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledOnce();
	});
});
