import { and, eq, isNull } from "drizzle-orm";
import { monitors } from "@/lib/db/schema/app";
import { workerDb } from "@/lib/db/worker";
import { checkHttpTarget } from "./http-check";
import { recordMonitorCheck } from "./record-check";

export async function runMonitorCheck(monitorId: string): Promise<void> {
	const [monitor] = await workerDb
		.select({
			id: monitors.id,
			url: monitors.url,
			timeoutMs: monitors.timeoutMs,
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
		return;
	}

	const result = await checkHttpTarget(monitor.url, monitor.timeoutMs);

	await recordMonitorCheck({
		monitorId: monitor.id,
		result,
	});
}
