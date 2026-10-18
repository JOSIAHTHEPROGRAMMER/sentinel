import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitors } from "@/lib/db/schema/app";
import { checkHttpTarget } from "./http-check";
import { recordMonitorCheck } from "./record-check";

export async function runMonitorCheck(
	monitorId: string,
	ownerId: string,
): Promise<void> {
	const monitor = await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${ownerId}, true)`);

		const [result] = await tx
			.select({
				id: monitors.id,
				url: monitors.url,
				enabled: monitors.enabled,
			})
			.from(monitors)
			.where(
				and(
					eq(monitors.id, monitorId),
					eq(monitors.ownerId, ownerId),
					eq(monitors.enabled, true),
				),
			)
			.limit(1);

		return result ?? null;
	});

	if (!monitor) {
		return;
	}

	const result = await checkHttpTarget(monitor.url);

	await recordMonitorCheck({
		monitorId: monitor.id,
		ownerId,
		result,
	});
}
