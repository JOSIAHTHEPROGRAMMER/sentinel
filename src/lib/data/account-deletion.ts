import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountDeletions } from "@/lib/db/schema/app";

export type PendingDeletion = {
	requestedAt: string;
	purgeAfter: string;
};

const pendingColumns = {
	requestedAt: accountDeletions.requestedAt,
	purgeAfter: accountDeletions.purgeAfter,
};

function toPending(row: { requestedAt: Date; purgeAfter: Date }) {
	return {
		requestedAt: row.requestedAt.toISOString(),
		purgeAfter: row.purgeAfter.toISOString(),
	};
}

export async function getPendingDeletion(
	userId: string,
): Promise<PendingDeletion | null> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const [row] = await tx
			.select(pendingColumns)
			.from(accountDeletions)
			.where(eq(accountDeletions.userId, userId))
			.limit(1);

		return row ? toPending(row) : null;
	});
}

export async function requestAccountDeletion(
	userId: string,
	purgeAfter: Date,
): Promise<PendingDeletion & { created: boolean }> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const [inserted] = await tx
			.insert(accountDeletions)
			.values({ userId, purgeAfter })
			.onConflictDoNothing({ target: accountDeletions.userId })
			.returning(pendingColumns);

		if (inserted) {
			return { ...toPending(inserted), created: true };
		}

		// A request already exists, so keep its original dates instead of extending them
		const [existing] = await tx
			.select(pendingColumns)
			.from(accountDeletions)
			.where(eq(accountDeletions.userId, userId))
			.limit(1);

		if (!existing) {
			throw new Error("Account deletion request could not be recorded");
		}

		return { ...toPending(existing), created: false };
	});
}

export async function cancelAccountDeletion(userId: string): Promise<boolean> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

		const removed = await tx
			.delete(accountDeletions)
			.where(eq(accountDeletions.userId, userId))
			.returning({ userId: accountDeletions.userId });

		return removed.length > 0;
	});
}
