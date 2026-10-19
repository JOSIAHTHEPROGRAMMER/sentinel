import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { and, eq, isNull } from "drizzle-orm";
import { monitors } from "@/lib/db/schema/app";
import { closeWorkerDb, workerDb } from "@/lib/db/worker";
import { runMonitorCheck } from "@/lib/monitoring/run-monitor-check";
import { createMonitorScheduler } from "@/lib/monitoring/scheduler";

const POLL_INTERVAL_MS = 15_000;

let stopping = false;
let timer: ReturnType<typeof setInterval> | undefined;

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
		await runMonitorCheck(monitorId);
		console.info(`Monitor check completed: ${monitorId}`);
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

	console.info("Waiting for active monitor checks to finish...");

	await scheduler.waitForIdle();
	await closeWorkerDb();

	console.info("Monitoring worker stopped.");
}

process.once("SIGINT", () => {
	void shutdown().catch((error) => {
		console.error("Worker shutdown failed:", error);
		process.exitCode = 1;
	});
});

process.once("SIGTERM", () => {
	void shutdown().catch((error) => {
		console.error("Worker shutdown failed:", error);
		process.exitCode = 1;
	});
});

async function main(): Promise<void> {
	console.info("Sentinel monitoring worker started.");

	await scheduler.poll();

	if (!stopping) {
		timer = setInterval(() => {
			void scheduler.poll();
		}, POLL_INTERVAL_MS);
	}
}

main().catch(async (error) => {
	console.error("Worker startup failed:", error);
	process.exitCode = 1;

	await shutdown();
});
