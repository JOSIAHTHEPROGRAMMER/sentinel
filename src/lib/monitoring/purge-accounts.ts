type PurgerOptions = {
	purge: () => Promise<number>;
	onPurged: (count: number) => void;
	onError: (error: unknown) => void;
};

export function createAccountPurger({
	purge,
	onPurged,
	onError,
}: PurgerOptions) {
	let running: Promise<void> | undefined;

	async function attempt(): Promise<void> {
		try {
			const count = await purge();

			if (count > 0) {
				onPurged(count);
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
		// can't leave the purger marked as running forever
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
