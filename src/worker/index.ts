import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { sql } from "drizzle-orm";
import { closeWorkerDb, workerDb } from "@/lib/db/worker";
import { createLeaseStore } from "@/lib/monitoring/lease-store";
import { createAccountPurger } from "@/lib/monitoring/purge-accounts";
import { createRetentionRunner } from "@/lib/monitoring/retention";
import { runMonitorCheck } from "@/lib/monitoring/run-monitor-check";
import { createMonitorScheduler } from "@/lib/monitoring/scheduler";

const POLL_INTERVAL_MS = 15_000;
const RETENTION_INTERVAL_MS = 60 * 60 * 1000;
const FORCE_EXIT_MS = 30_000;

// Identifies this process in leases and logs, so two workers can be told apart
const instanceId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

let stopping = false;
let timer: ReturnType<typeof setInterval> | undefined;
let retentionTimer: ReturnType<typeof setInterval> | undefined;

function log(
	level: "info" | "error",
	event: string,
	fields: Record<string, unknown> = {},
): void {
	const line = JSON.stringify({
		time: new Date().toISOString(),
		level,
		instanceId,
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

const leases = createLeaseStore({
	execute: (query) => workerDb.execute(query),
	owner: instanceId,
});

const scheduler = createMonitorScheduler({
	claimDue: (limit) => leases.claimDue(limit),
	release: (monitorId) => leases.release(monitorId),

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

const purger = createAccountPurger({
	purge: async () => {
		const result = await workerDb.execute(
			sql`SELECT app.purge_due_account_deletions() AS purged`,
		);

		const [row] = result.rows as Array<{ purged: number | string }>;

		return Number(row?.purged ?? 0);
	},
	onPurged: (count) => {
		log("info", "accounts.purged", { count });
	},
	onError: (error) => {
		log("error", "accounts.purge_failed", describeError(error));
	},
});

const retention = createRetentionRunner({
	runBatch: async () => {
		const result = await workerDb.execute(
			sql`SELECT hours_rolled, rows_deleted FROM app.run_check_retention()`,
		);

		const [row] = result.rows as Array<{
			hours_rolled: number | string;
			rows_deleted: number | string;
		}>;

		return {
			hoursRolled: Number(row?.hours_rolled ?? 0),
			rowsDeleted: Number(row?.rows_deleted ?? 0),
		};
	},
	onFinished: (totals) => {
		log("info", "retention.completed", totals);
	},
	onError: (error) => {
		log("error", "retention.failed", describeError(error));
	},
	shouldStop: () => stopping,
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

	if (retentionTimer) {
		clearInterval(retentionTimer);
	}

	// A hung shutdown must not keep a dead worker alive; the supervisor restarts it
	setTimeout(() => process.exit(1), FORCE_EXIT_MS).unref();

	log("info", "worker.stopping");

	await scheduler.waitForIdle();
	await purger.waitForIdle();
	await retention.waitForIdle();
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
	log("info", "worker.started", {
		pollIntervalMs: POLL_INTERVAL_MS,
		retentionIntervalMs: RETENTION_INTERVAL_MS,
	});

	await scheduler.poll();

	if (!stopping) {
		void purger.run();
		void retention.run();

		timer = setInterval(() => {
			void scheduler.poll();
			void purger.run();
		}, POLL_INTERVAL_MS);

		retentionTimer = setInterval(() => {
			void retention.run();
		}, RETENTION_INTERVAL_MS);
	}
}

main().catch((error) => fail("worker.startup_failed", error));
