import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { createMonitorScheduler } from "./scheduler";

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;

	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

describe("monitor scheduler", () => {
	let claimDue: Mock<(limit: number) => Promise<string[]>>;
	let release: Mock<(monitorId: string) => Promise<void>>;
	let runCheck: Mock<(monitorId: string) => Promise<void>>;
	let onError: Mock<(message: string, error: unknown) => void>;

	beforeEach(() => {
		claimDue = vi.fn(async (_limit: number): Promise<string[]> => []);
		release = vi.fn(async (_monitorId: string): Promise<void> => {});
		runCheck = vi.fn(async (_monitorId: string): Promise<void> => {});
		onError = vi.fn((_message: string, _error: unknown): void => {});
	});

	function createScheduler(maxConcurrentChecks?: number) {
		return createMonitorScheduler({
			claimDue,
			release,
			runCheck,
			onError,
			maxConcurrentChecks,
		});
	}

	it("runs a check for each monitor it claims", async () => {
		claimDue.mockResolvedValue(["monitor-1", "monitor-2"]);

		const scheduler = createScheduler();

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledTimes(2);
		expect(runCheck).toHaveBeenCalledWith("monitor-1");
		expect(runCheck).toHaveBeenCalledWith("monitor-2");
	});

	it("runs nothing when no monitor is due", async () => {
		const scheduler = createScheduler();

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(claimDue).toHaveBeenCalledOnce();
		expect(runCheck).not.toHaveBeenCalled();
	});

	it("asks for as many monitors as there are free slots", async () => {
		const pending = deferred<void>();
		claimDue.mockResolvedValueOnce(["monitor-1"]);
		runCheck.mockReturnValue(pending.promise);

		const scheduler = createScheduler(3);

		await scheduler.poll();
		expect(claimDue).toHaveBeenLastCalledWith(3);

		await scheduler.poll();
		expect(claimDue).toHaveBeenLastCalledWith(2);

		pending.resolve();
		await scheduler.waitForIdle();
	});

	it("does not claim anything while every slot is busy", async () => {
		const pending = deferred<void>();
		claimDue.mockResolvedValueOnce(["monitor-1"]);
		runCheck.mockReturnValue(pending.promise);

		const scheduler = createScheduler(1);

		await scheduler.poll();
		await scheduler.poll();

		expect(claimDue).toHaveBeenCalledOnce();

		pending.resolve();
		await scheduler.waitForIdle();
	});

	it("claims again once a slot frees up", async () => {
		claimDue.mockResolvedValueOnce(["monitor-1"]);

		const scheduler = createScheduler(1);

		await scheduler.poll();
		await scheduler.waitForIdle();

		claimDue.mockResolvedValueOnce(["monitor-2"]);

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledTimes(2);
		expect(runCheck).toHaveBeenLastCalledWith("monitor-2");
	});

	it("never runs a monitor twice at once if it is claimed again while running", async () => {
		const pending = deferred<void>();
		claimDue.mockResolvedValue(["monitor-1"]);
		runCheck.mockReturnValue(pending.promise);

		const scheduler = createScheduler(5);

		await scheduler.poll();
		await scheduler.poll();

		expect(runCheck).toHaveBeenCalledOnce();

		pending.resolve();
		await scheduler.waitForIdle();
	});

	it("releases the lease after a successful check", async () => {
		claimDue.mockResolvedValueOnce(["monitor-1"]);

		const scheduler = createScheduler();

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(release).toHaveBeenCalledOnce();
		expect(release).toHaveBeenCalledWith("monitor-1");
		expect(runCheck.mock.invocationCallOrder[0]).toBeLessThan(
			release.mock.invocationCallOrder[0] ?? 0,
		);
	});

	it("holds the lease until the check has finished", async () => {
		const pending = deferred<void>();
		claimDue.mockResolvedValueOnce(["monitor-1"]);
		runCheck.mockReturnValue(pending.promise);

		const scheduler = createScheduler();

		await scheduler.poll();
		await Promise.resolve();

		expect(release).not.toHaveBeenCalled();

		pending.resolve();
		await scheduler.waitForIdle();

		expect(release).toHaveBeenCalledOnce();
	});

	it("logs a failed check, still releases the lease and keeps scheduling", async () => {
		claimDue.mockResolvedValueOnce(["monitor-1"]);
		runCheck.mockRejectedValueOnce(new Error("Network failure"));

		const scheduler = createScheduler();

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(onError).toHaveBeenCalledWith(
			"Monitor check failed for monitor-1:",
			expect.any(Error),
		);
		expect(release).toHaveBeenCalledWith("monitor-1");

		claimDue.mockResolvedValueOnce(["monitor-1"]);

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledTimes(2);
	});

	it("reports a failed release without stalling the scheduler", async () => {
		claimDue.mockResolvedValueOnce(["monitor-1"]);
		release.mockRejectedValueOnce(new Error("Database unavailable"));

		const scheduler = createScheduler(1);

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(onError).toHaveBeenCalledWith(
			"Releasing lease failed for monitor-1:",
			expect.any(Error),
		);

		claimDue.mockResolvedValueOnce(["monitor-2"]);

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledTimes(2);
	});

	it("stops scheduling and waits for active checks to finish", async () => {
		const pending = deferred<void>();
		claimDue.mockResolvedValueOnce(["monitor-1"]);
		runCheck.mockReturnValue(pending.promise);

		const scheduler = createScheduler();

		await scheduler.poll();
		expect(runCheck).toHaveBeenCalledOnce();

		scheduler.stop();

		await scheduler.poll();
		expect(claimDue).toHaveBeenCalledOnce();
		expect(runCheck).toHaveBeenCalledOnce();

		let finished = false;

		const idlePromise = scheduler.waitForIdle().then(() => {
			finished = true;
		});

		await Promise.resolve();
		expect(finished).toBe(false);

		pending.resolve();
		await idlePromise;

		expect(finished).toBe(true);
	});

	it("still runs monitors it had already claimed when stopped mid-claim", async () => {
		const pendingClaim = deferred<string[]>();
		claimDue.mockReturnValueOnce(pendingClaim.promise);

		const scheduler = createScheduler();

		const poll = scheduler.poll();
		scheduler.stop();

		pendingClaim.resolve(["monitor-1"]);
		await poll;
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledOnce();
		expect(release).toHaveBeenCalledWith("monitor-1");
	});

	it("logs claim errors and recovers on the next poll", async () => {
		claimDue.mockRejectedValueOnce(new Error("Database unavailable"));

		const scheduler = createScheduler();

		await scheduler.poll();

		expect(onError).toHaveBeenCalledWith(
			"Monitor scheduling failed:",
			expect.any(Error),
		);

		claimDue.mockResolvedValueOnce(["monitor-1"]);

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledOnce();
	});

	it("prevents overlapping scheduler polls", async () => {
		const pendingClaim = deferred<string[]>();
		claimDue.mockReturnValueOnce(pendingClaim.promise);

		const scheduler = createScheduler();

		const firstPoll = scheduler.poll();

		await scheduler.poll();

		expect(claimDue).toHaveBeenCalledOnce();

		pendingClaim.resolve(["monitor-1"]);

		await firstPoll;
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledOnce();
	});

	it("frees a monitor whose check exceeds the time limit and releases its lease", async () => {
		vi.useFakeTimers();

		try {
			claimDue.mockResolvedValueOnce(["monitor-1"]);
			runCheck.mockReturnValueOnce(new Promise<void>(() => {}));

			const scheduler = createMonitorScheduler({
				claimDue,
				release,
				runCheck,
				onError,
				checkTimeoutMs: 1_000,
			});

			await scheduler.poll();
			await vi.advanceTimersByTimeAsync(1_000);
			await scheduler.waitForIdle();

			expect(onError).toHaveBeenCalledWith(
				"Monitor check failed for monitor-1:",
				expect.any(Error),
			);
			expect(release).toHaveBeenCalledWith("monitor-1");

			claimDue.mockResolvedValueOnce(["monitor-1"]);

			await scheduler.poll();
			await scheduler.waitForIdle();

			expect(runCheck).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("recovers when a check throws synchronously", async () => {
		claimDue.mockResolvedValueOnce(["monitor-1"]);
		runCheck.mockImplementationOnce(() => {
			throw new Error("Unexpected failure");
		});

		const scheduler = createScheduler();

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(onError).toHaveBeenCalledWith(
			"Monitor check failed for monitor-1:",
			expect.any(Error),
		);
		expect(release).toHaveBeenCalledWith("monitor-1");

		claimDue.mockResolvedValueOnce(["monitor-1"]);

		await scheduler.poll();
		await scheduler.waitForIdle();

		expect(runCheck).toHaveBeenCalledTimes(2);
	});
});
