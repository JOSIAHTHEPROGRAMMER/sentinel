export type RetentionBatch = {
	hoursRolled: number;
	rowsDeleted: number;
};

export type RetentionTotals = RetentionBatch & {
	batches: number;
	// False when the batch cap stopped the run before it caught up
	finished: boolean;
};

type RetentionRunnerOptions = {
	runBatch: () => Promise<RetentionBatch>;
	onFinished: (totals: RetentionTotals) => void;
	onError: (error: unknown) => void;
	maxBatches?: number;
	shouldStop?: () => boolean;
};

// Bounded so one run can't occupy the worker indefinitely while catching up
export const DEFAULT_MAX_BATCHES = 24;

export function createRetentionRunner({
	runBatch,
	onFinished,
	onError,
	maxBatches = DEFAULT_MAX_BATCHES,
	shouldStop,
}: RetentionRunnerOptions) {
	let running: Promise<void> | undefined;

	async function attempt(): Promise<void> {
		let hoursRolled = 0;
		let rowsDeleted = 0;
		let batches = 0;
		let finished = false;

		try {
			while (batches < maxBatches) {
				if (shouldStop?.()) {
					break;
				}

				const batch = await runBatch();

				batches += 1;
				hoursRolled += batch.hoursRolled;
				rowsDeleted += batch.rowsDeleted;

				// Nothing left to do, or another instance holds the run
				if (batch.hoursRolled === 0 && batch.rowsDeleted === 0) {
					finished = true;
					break;
				}
			}

			if (hoursRolled > 0 || rowsDeleted > 0) {
				onFinished({ hoursRolled, rowsDeleted, batches, finished });
			}
		} catch (error) {
			onError(error);
		}
	}

	function run(): Promise<void> {
		if (running) {
			return running;
		}

		// The reset is attached after assignment so a synchronous failure
		// can't leave the runner marked as running forever
		const current = attempt().finally(() => {
			running = undefined;
		});

		running = current;

		return current;
	}

	async function waitForIdle(): Promise<void> {
		await running;
	}

	return { run, waitForIdle };
}
