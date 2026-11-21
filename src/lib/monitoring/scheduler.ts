export type ScheduledMonitor = {
	id: string;
	intervalSeconds: number;
};

type SchedulerOptions = {
	getEligibleMonitors: () => Promise<ScheduledMonitor[]>;
	runCheck: (monitorId: string) => Promise<void>;
	now?: () => number;
	onError?: (message: string, error: unknown) => void;
	checkTimeoutMs?: number;
	maxConcurrentChecks?: number;
};

const MIN_INTERVAL_SECONDS = 1;
const DEFAULT_CHECK_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_CONCURRENT_CHECKS = 10;

export function createMonitorScheduler({
	getEligibleMonitors,
	runCheck,
	now = Date.now,
	onError = (message, error) => console.error(message, error),
	checkTimeoutMs = DEFAULT_CHECK_TIMEOUT_MS,
	maxConcurrentChecks = DEFAULT_MAX_CONCURRENT_CHECKS,
}: SchedulerOptions) {
	// Storing the last start time, not the next run time, means an interval
	// change applies on the next poll instead of after the old schedule expires
	const lastStartedAt = new Map<string, number>();
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
	}

	async function pollMonitors(): Promise<void> {
		if (stopping || pollInProgress) {
			return;
		}

		pollInProgress = true;

		try {
			const eligibleMonitors = await getEligibleMonitors();
			const eligibleIds = new Set(
				eligibleMonitors.map((monitor) => monitor.id),
			);

			for (const monitorId of lastStartedAt.keys()) {
				if (!eligibleIds.has(monitorId)) {
					lastStartedAt.delete(monitorId);
				}
			}

			const currentTime = now();

			const due = eligibleMonitors
				.filter((monitor) => !activeChecks.has(monitor.id))
				.map((monitor) => {
					const intervalMs =
						Math.max(MIN_INTERVAL_SECONDS, monitor.intervalSeconds) * 1_000;
					const lastStarted = lastStartedAt.get(monitor.id);

					return {
						id: monitor.id,
						dueAt:
							lastStarted === undefined
								? Number.NEGATIVE_INFINITY
								: lastStarted + intervalMs,
					};
				})
				.filter((entry) => entry.dueAt <= currentTime)
				.sort((a, b) => (a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0));

			// Monitors skipped by the cap keep no start time, so they stay due
			// and, being the most overdue, go first on the next poll
			for (const entry of due) {
				if (stopping || activeChecks.size >= maxConcurrentChecks) {
					break;
				}

				lastStartedAt.set(entry.id, currentTime);

				const checkPromise = executeCheck(entry.id).finally(() => {
					activeChecks.delete(entry.id);
				});
				activeChecks.set(entry.id, checkPromise);
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
