import { and, eq, isNull } from "drizzle-orm";
import { monitors } from "@/lib/db/schema/app";
import { closeWorkerDb, workerDb } from "@/lib/db/worker";
import { runMonitorCheck } from "@/lib/monitoring/run-monitor-check";
import { createMonitorScheduler } from "@/lib/monitoring/scheduler";

const POLL_INTERVAL_MS = 15_000;
const FORCE_EXIT_MS = 30_000;

let stopping = false;
let timer: ReturnType<typeof setInterval> | undefined;

function log(
	level: "info" | "error",
	event: string,
	fields: Record<string, unknown> = {},
): void {
	const line = JSON.stringify({
		time: new Date().toISOString(),
		level,
		event,
		...fields,
	});

	if (level === "error") {
		console.error(line);
	} else {
		console.info(line);
	}
}

function describeError(error: unknown) {
	return error instanceof Error
		? { name: error.name, message: error.message, stack: error.stack }
		: { message: String(error) };
}

const scheduler = createMonitorScheduler({
	getEligibleMonitors: async () =>
		workerDb
			.select({
				id: monitors.id,
				intervalSeconds: monitors.intervalSeconds,
			})
			.from(monitors)
			.where(and(eq(monitors.enabled, true), isNull(monitors.deletedAt))),

	runCheck: async (monitorId) => {
		const startedAt = Date.now();

		const summary = await runMonitorCheck(monitorId);

		if (!summary) {
			log("info", "check.skipped", { monitorId });
			return;
		}

		log("info", "check.completed", {
			monitorId,
			success: summary.success,
			statusCode: summary.statusCode,
			responseTimeMs: summary.responseTimeMs,
			error: summary.error,
			durationMs: Date.now() - startedAt,
		});
	},

	onError: (message, error) => {
		log("error", "scheduler.error", {
			context: message,
			...describeError(error),
		});
	},
});

async function shutdown(): Promise<void> {
	if (stopping) {
		return;
	}

	stopping = true;
	scheduler.stop();

	if (timer) {
		clearInterval(timer);
	}

	// A hung shutdown must not keep a dead worker alive; the supervisor restarts it
	setTimeout(() => process.exit(1), FORCE_EXIT_MS).unref();

	log("info", "worker.stopping");

	await scheduler.waitForIdle();
	await closeWorkerDb();

	log("info", "worker.stopped");
}

function shutdownAndReport(): void {
	void shutdown().catch((error) => {
		log("error", "worker.shutdown_failed", describeError(error));
		process.exitCode = 1;
	});
}

function fail(event: string, error: unknown): void {
	log("error", event, describeError(error));
	process.exitCode = 1;
	shutdownAndReport();
}

process.once("SIGINT", shutdownAndReport);
process.once("SIGTERM", shutdownAndReport);
process.on("unhandledRejection", (reason) =>
	fail("worker.unhandled_rejection", reason),
);
process.on("uncaughtException", (error) =>
	fail("worker.uncaught_exception", error),
);

async function main(): Promise<void> {
	log("info", "worker.started", { pollIntervalMs: POLL_INTERVAL_MS });

	await scheduler.poll();

	if (!stopping) {
		timer = setInterval(() => {
			void scheduler.poll();
		}, POLL_INTERVAL_MS);
	}
}

main().catch((error) => fail("worker.startup_failed", error));
