import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema/app";
import {
	DEFAULT_USER_SETTINGS,
	type UserSettings,
} from "@/lib/validation/user-settings";

export async function getUserSettings(userId: string): Promise<UserSettings> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const [row] = await tx
			.select({
				defaultIntervalSeconds: userSettings.defaultIntervalSeconds,
				defaultTimeoutMs: userSettings.defaultTimeoutMs,
			})
			.from(userSettings)
			.where(eq(userSettings.userId, userId))
			.limit(1);

		return row ?? DEFAULT_USER_SETTINGS;
	});
}

export async function saveUserSettings(
	userId: string,
	settings: UserSettings,
): Promise<UserSettings> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const [row] = await tx
			.insert(userSettings)
			.values({ userId, ...settings })
			.onConflictDoUpdate({
				target: userSettings.userId,
				set: { ...settings, updatedAt: new Date() },
			})
			.returning({
				defaultIntervalSeconds: userSettings.defaultIntervalSeconds,
				defaultTimeoutMs: userSettings.defaultTimeoutMs,
			});

		return row ?? settings;
	});
}
