import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitors } from "@/lib/db/schema/app";

export async function getMonitorsForUser(userId: string) {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const results = await tx
			.select({
				id: monitors.id,
				name: monitors.name,
				url: monitors.url,
				enabled: monitors.enabled,
				intervalSeconds: monitors.intervalSeconds,
				timeoutMs: monitors.timeoutMs,
				createdAt: monitors.createdAt,
				updatedAt: monitors.updatedAt,
			})
			.from(monitors)
			.where(isNull(monitors.deletedAt))
			.orderBy(monitors.createdAt);

		return results.map((monitor) => ({
			...monitor,
			createdAt: monitor.createdAt.toISOString(),
			updatedAt: monitor.updatedAt.toISOString(),
		}));
	});
}

export async function getMonitorForUser(userId: string, monitorId: string) {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const [monitor] = await tx
			.select({
				id: monitors.id,
				name: monitors.name,
				url: monitors.url,
				enabled: monitors.enabled,
				intervalSeconds: monitors.intervalSeconds,
				timeoutMs: monitors.timeoutMs,
				createdAt: monitors.createdAt,
				updatedAt: monitors.updatedAt,
			})
			.from(monitors)
			.where(and(eq(monitors.id, monitorId), isNull(monitors.deletedAt)))
			.limit(1);

		if (!monitor) {
			return null;
		}

		return {
			...monitor,
			createdAt: monitor.createdAt.toISOString(),
			updatedAt: monitor.updatedAt.toISOString(),
		};
	});
}
