import { and, eq, isNull } from "drizzle-orm";
import { monitors } from "@/lib/db/schema/app";
import { workerDb } from "@/lib/db/worker";
import { checkHttpTarget } from "./http-check";
import { recordMonitorCheck } from "./record-check";

export type MonitorCheckSummary = {
	success: boolean;
	statusCode: number | null;
	responseTimeMs: number;
	error?: string;
};

export async function runMonitorCheck(
	monitorId: string,
): Promise<MonitorCheckSummary | null> {
	const [monitor] = await workerDb
		.select({
			id: monitors.id,
			url: monitors.url,
			timeoutMs: monitors.timeoutMs,
			intervalSeconds: monitors.intervalSeconds,
			failureThreshold: monitors.failureThreshold,
			recoveryThreshold: monitors.recoveryThreshold,
		})
		.from(monitors)
		.where(
			and(
				eq(monitors.id, monitorId),
				eq(monitors.enabled, true),
				isNull(monitors.deletedAt),
			),
		)
		.limit(1);

	if (!monitor) {
		return null;
	}

	const result = await checkHttpTarget(monitor.url, monitor.timeoutMs);

	await recordMonitorCheck({
		monitorId: monitor.id,
		result,
		config: {
			failureThreshold: monitor.failureThreshold,
			recoveryThreshold: monitor.recoveryThreshold,
			intervalSeconds: monitor.intervalSeconds,
		},
	});

	return {
		success: result.success,
		statusCode: result.statusCode,
		responseTimeMs: result.responseTimeMs,
		error: result.error,
	};
}
