import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { createAccountPurger } from "./purge-accounts";

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;

	const promise = new Promise<T>((res) => {
		resolve = res;
	});

	return { promise, resolve };
}

describe("account purger", () => {
	let purge: Mock<() => Promise<number>>;
	let onPurged: Mock<(count: number) => void>;
	let onError: Mock<(error: unknown) => void>;

	beforeEach(() => {
		purge = vi.fn(async () => 0);
		onPurged = vi.fn();
		onError = vi.fn();
	});

	function createPurger() {
		return createAccountPurger({ purge, onPurged, onError });
	}

	it("reports how many accounts were purged", async () => {
		purge.mockResolvedValue(2);

		await createPurger().run();

		expect(onPurged).toHaveBeenCalledWith(2);
		expect(onError).not.toHaveBeenCalled();
	});

	it("stays silent when nothing was due", async () => {
		purge.mockResolvedValue(0);

		await createPurger().run();

		expect(purge).toHaveBeenCalledOnce();
		expect(onPurged).not.toHaveBeenCalled();
	});

	it("reports a failure and does not throw", async () => {
		const failure = new Error("Database unavailable");
		purge.mockRejectedValue(failure);

		await expect(createPurger().run()).resolves.toBeUndefined();

		expect(onError).toHaveBeenCalledWith(failure);
		expect(onPurged).not.toHaveBeenCalled();
	});

	it("recovers on the next run after a failure", async () => {
		purge.mockRejectedValueOnce(new Error("Database unavailable"));
		purge.mockResolvedValueOnce(1);

		const purger = createPurger();

		await purger.run();
		await purger.run();

		expect(onError).toHaveBeenCalledOnce();
		expect(onPurged).toHaveBeenCalledWith(1);
	});

	it("does not start a second purge while one is running", async () => {
		const pending = deferred<number>();
		purge.mockReturnValue(pending.promise);

		const purger = createPurger();

		const first = purger.run();
		const second = purger.run();

		expect(purge).toHaveBeenCalledOnce();

		pending.resolve(1);
		await Promise.all([first, second]);

		expect(onPurged).toHaveBeenCalledOnce();
	});

	it("allows a new purge once the previous one has finished", async () => {
		const purger = createPurger();

		await purger.run();
		await purger.run();

		expect(purge).toHaveBeenCalledTimes(2);
	});

	it("recovers when the purge call throws synchronously", async () => {
		purge.mockImplementationOnce(() => {
			throw new Error("Unexpected failure");
		});

		const purger = createPurger();

		await purger.run();

		expect(onError).toHaveBeenCalledOnce();

		await purger.run();

		expect(purge).toHaveBeenCalledTimes(2);
	});

	it("waits for an in-progress purge to finish", async () => {
		const pending = deferred<number>();
		purge.mockReturnValue(pending.promise);

		const purger = createPurger();
		void purger.run();

		let finished = false;
		const idle = purger.waitForIdle().then(() => {
			finished = true;
		});

		await Promise.resolve();
		expect(finished).toBe(false);

		pending.resolve(0);
		await idle;

		expect(finished).toBe(true);
	});

	it("resolves immediately when nothing is running", async () => {
		await expect(createPurger().waitForIdle()).resolves.toBeUndefined();
	});
});
