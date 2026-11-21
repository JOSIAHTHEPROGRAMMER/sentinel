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
};

const MIN_INTERVAL_SECONDS = 1;
const DEFAULT_CHECK_TIMEOUT_MS = 60_000;

export function createMonitorScheduler({
	getEligibleMonitors,
	runCheck,
	now = Date.now,
	onError = (message, error) => console.error(message, error),
	checkTimeoutMs = DEFAULT_CHECK_TIMEOUT_MS,
}: SchedulerOptions) {
	const nextRunAt = new Map<string, number>();
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

			for (const monitorId of nextRunAt.keys()) {
				if (!eligibleIds.has(monitorId)) {
					nextRunAt.delete(monitorId);
				}
			}

			const currentTime = now();

			for (const monitor of eligibleMonitors) {
				if (stopping) {
					break;
				}

				if (activeChecks.has(monitor.id)) {
					continue;
				}

				const scheduledAt = nextRunAt.get(monitor.id) ?? 0;

				if (currentTime < scheduledAt) {
					continue;
				}

				const intervalSeconds = Math.max(
					MIN_INTERVAL_SECONDS,
					monitor.intervalSeconds,
				);

				nextRunAt.set(monitor.id, currentTime + intervalSeconds * 1_000);

				const checkPromise = executeCheck(monitor.id).finally(() => {
					activeChecks.delete(monitor.id);
				});
				activeChecks.set(monitor.id, checkPromise);
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
