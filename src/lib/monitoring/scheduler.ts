type SchedulerOptions = {
	claimDue: (limit: number) => Promise<string[]>;
	release: (monitorId: string) => Promise<void>;
	runCheck: (monitorId: string) => Promise<void>;
	onError?: (message: string, error: unknown) => void;
	checkTimeoutMs?: number;
	maxConcurrentChecks?: number;
};

const DEFAULT_CHECK_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_CONCURRENT_CHECKS = 10;

export function createMonitorScheduler({
	claimDue,
	release,
	runCheck,
	onError = (message, error) => console.error(message, error),
	checkTimeoutMs = DEFAULT_CHECK_TIMEOUT_MS,
	maxConcurrentChecks = DEFAULT_MAX_CONCURRENT_CHECKS,
}: SchedulerOptions) {
	const activeChecks = new Map<string, Promise<void>>();

	let stopping = false;
	let pollInProgress = false;
	let pollPromise: Promise<void> | undefined;

	async function executeCheck(monitorId: string): Promise<void> {
		let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

		try {
			await Promise.race([
				runCheck(monitorId),
				new Promise<never>((_, reject) => {
					timeoutHandle = setTimeout(
						() => reject(new Error(`Check exceeded ${checkTimeoutMs}ms`)),
						checkTimeoutMs,
					);
				}),
			]);
		} catch (error) {
			onError(`Monitor check failed for ${monitorId}:`, error);
		} finally {
			clearTimeout(timeoutHandle);
		}

		// Released whether the check succeeded, failed or timed out. If this fails
		// the lease simply expires, and the monitor becomes claimable again
		try {
			await release(monitorId);
		} catch (error) {
			onError(`Releasing lease failed for ${monitorId}:`, error);
		}
	}

	async function pollMonitors(): Promise<void> {
		if (stopping || pollInProgress) {
			return;
		}

		pollInProgress = true;

		try {
			const capacity = maxConcurrentChecks - activeChecks.size;

			if (capacity <= 0) {
				return;
			}

			const claimed = await claimDue(capacity);

			// Monitors claimed before a stop are still run: they hold a lease, and
			// shutdown already waits for in-flight checks
			for (const monitorId of claimed) {
				if (activeChecks.has(monitorId)) {
					continue;
				}

				const checkPromise = executeCheck(monitorId).finally(() => {
					activeChecks.delete(monitorId);
				});
				activeChecks.set(monitorId, checkPromise);
			}
		} catch (error) {
			onError("Monitor scheduling failed:", error);
		} finally {
			pollInProgress = false;
		}
	}

	function poll(): Promise<void> {
		if (stopping || pollInProgress) {
			return Promise.resolve();
		}

		pollPromise = pollMonitors();
		return pollPromise;
	}

	function stop(): void {
		stopping = true;
	}

	async function waitForIdle(): Promise<void> {
		await pollPromise;

		while (activeChecks.size > 0) {
			await Promise.all([...activeChecks.values()]);
		}
	}

	return {
		poll,
		stop,
		waitForIdle,
	};
}
