import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	cancelAccountDeletion,
	getPendingDeletion,
	requestAccountDeletion,
} from "@/lib/data/account-deletion";
import { getUserSettings, saveUserSettings } from "@/lib/data/user-settings";
import { db } from "@/lib/db";
import { accountDeletions, monitors, userSettings } from "@/lib/db/schema/app";
import { user } from "@/lib/db/schema/auth";
import { workerDb } from "@/lib/db/worker";
import { DEFAULT_USER_SETTINGS } from "@/lib/validation/user-settings";
import {
	asUser,
	cleanupTestUsers,
	createTestUser,
	seedMonitor,
} from "./helpers";

const HOUR_MS = 3_600_000;

async function userExists(userId: string): Promise<boolean> {
	const rows = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.id, userId));

	return rows.length > 0;
}

describe("user settings", () => {
	beforeAll(async () => {
		await cleanupTestUsers();
	});

	afterAll(async () => {
		await cleanupTestUsers();
	});

	it("returns the built-in defaults for a user who never saved", async () => {
		const owner = await createTestUser("fresh");

		expect(await getUserSettings(owner.id)).toEqual(DEFAULT_USER_SETTINGS);
	});

	it("saves settings and reads them back", async () => {
		const owner = await createTestUser("saver");
		const settings = { defaultIntervalSeconds: 120, defaultTimeoutMs: 5_000 };

		expect(await saveUserSettings(owner.id, settings)).toEqual(settings);
		expect(await getUserSettings(owner.id)).toEqual(settings);
	});

	it("updates the same row on a second save", async () => {
		const owner = await createTestUser("updater");

		await saveUserSettings(owner.id, {
			defaultIntervalSeconds: 120,
			defaultTimeoutMs: 5_000,
		});
		await saveUserSettings(owner.id, {
			defaultIntervalSeconds: 900,
			defaultTimeoutMs: 8_000,
		});

		expect(await getUserSettings(owner.id)).toEqual({
			defaultIntervalSeconds: 900,
			defaultTimeoutMs: 8_000,
		});

		const rows = await asUser(owner.id, (tx) => tx.select().from(userSettings));

		expect(rows).toHaveLength(1);
	});

	it("keeps users' settings separate", async () => {
		const first = await createTestUser("first");
		const second = await createTestUser("second");

		await saveUserSettings(first.id, {
			defaultIntervalSeconds: 120,
			defaultTimeoutMs: 5_000,
		});

		expect(await getUserSettings(second.id)).toEqual(DEFAULT_USER_SETTINGS);
	});

	it("rejects values the database constraints forbid", async () => {
		const owner = await createTestUser("invalid");

		await expect(
			saveUserSettings(owner.id, {
				defaultIntervalSeconds: 5,
				defaultTimeoutMs: 5_000,
			}),
		).rejects.toThrow();
		await expect(
			saveUserSettings(owner.id, {
				defaultIntervalSeconds: 120,
				defaultTimeoutMs: 999_999,
			}),
		).rejects.toThrow();
		expect(await getUserSettings(owner.id)).toEqual(DEFAULT_USER_SETTINGS);
	});
});

describe("account deletion requests", () => {
	beforeAll(async () => {
		await cleanupTestUsers();
	});

	afterAll(async () => {
		await cleanupTestUsers();
	});

	it("reports nothing pending for a normal user", async () => {
		const owner = await createTestUser("normal");

		expect(await getPendingDeletion(owner.id)).toBeNull();
	});

	it("records a request with the requested purge date", async () => {
		const owner = await createTestUser("requester");
		const purgeAfter = new Date(Date.now() + 24 * HOUR_MS);

		const result = await requestAccountDeletion(owner.id, purgeAfter);

		expect(result.created).toBe(true);
		expect(result.purgeAfter).toBe(purgeAfter.toISOString());
		expect(await getPendingDeletion(owner.id)).toEqual({
			requestedAt: result.requestedAt,
			purgeAfter: purgeAfter.toISOString(),
		});
	});

	it("keeps the original dates when a request is repeated", async () => {
		const owner = await createTestUser("repeater");
		const first = await requestAccountDeletion(
			owner.id,
			new Date(Date.now() + 24 * HOUR_MS),
		);
		const second = await requestAccountDeletion(
			owner.id,
			new Date(Date.now() + 90 * 24 * HOUR_MS),
		);

		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		expect(second.purgeAfter).toBe(first.purgeAfter);
		expect(second.requestedAt).toBe(first.requestedAt);
	});

	it("cancels a pending request, once", async () => {
		const owner = await createTestUser("canceller");

		await requestAccountDeletion(owner.id, new Date(Date.now() + 24 * HOUR_MS));

		expect(await cancelAccountDeletion(owner.id)).toBe(true);
		expect(await getPendingDeletion(owner.id)).toBeNull();
		expect(await cancelAccountDeletion(owner.id)).toBe(false);
	});

	it("does not let one user see or cancel another user's request", async () => {
		const owner = await createTestUser("owner");
		const stranger = await createTestUser("stranger");

		await requestAccountDeletion(owner.id, new Date(Date.now() + 24 * HOUR_MS));

		expect(await getPendingDeletion(stranger.id)).toBeNull();
		expect(await cancelAccountDeletion(stranger.id)).toBe(false);
		expect(await getPendingDeletion(owner.id)).not.toBeNull();
	});
});

describe("account purge", () => {
	beforeAll(async () => {
		await cleanupTestUsers();
	});

	afterAll(async () => {
		await cleanupTestUsers();
	});

	it("deletes accounts whose grace period has passed, with all their data", async () => {
		const due = await createTestUser("due");
		const dueMonitor = await seedMonitor(due.id, {
			checks: [{ minutesAgo: 5, status: "up" }],
		});
		const past = Date.now() - 10 * 60_000;

		await asUser(due.id, (tx) =>
			tx.insert(accountDeletions).values({
				userId: due.id,
				requestedAt: new Date(past - 60_000),
				purgeAfter: new Date(past),
			}),
		);

		await workerDb.execute(
			sql`SELECT app.purge_due_account_deletions() AS purged`,
		);

		// A running worker may purge it first, so this checks state, not the count
		expect(await userExists(due.id)).toBe(false);

		const remaining = await asUser(due.id, (tx) =>
			tx
				.select({ id: monitors.id })
				.from(monitors)
				.where(eq(monitors.id, dueMonitor)),
		);

		expect(remaining).toHaveLength(0);
	});

	it("leaves accounts whose grace period has not passed", async () => {
		const pending = await createTestUser("pending");

		await requestAccountDeletion(
			pending.id,
			new Date(Date.now() + 24 * HOUR_MS),
		);

		await workerDb.execute(
			sql`SELECT app.purge_due_account_deletions() AS purged`,
		);

		expect(await userExists(pending.id)).toBe(true);
		expect(await getPendingDeletion(pending.id)).not.toBeNull();
	});

	it("leaves accounts with no deletion request", async () => {
		const normal = await createTestUser("normal");

		await workerDb.execute(
			sql`SELECT app.purge_due_account_deletions() AS purged`,
		);

		expect(await userExists(normal.id)).toBe(true);
	});

	it("is not callable by the web application role", async () => {
		await expect(
			db.execute(sql`SELECT app.purge_due_account_deletions()`),
		).rejects.toThrow();
	});

	it("does not let the worker role delete users directly", async () => {
		const target = await createTestUser("protected");

		await expect(
			workerDb.execute(sql`DELETE FROM auth."user" WHERE id = ${target.id}`),
		).rejects.toThrow();
		expect(await userExists(target.id)).toBe(true);
	});
});
