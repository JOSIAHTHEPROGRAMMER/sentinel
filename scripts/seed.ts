import { and, eq, inArray, sql } from "drizzle-orm";
import { closeDb, db } from "../src/lib/db";
import { checkResults, incidents, monitors } from "../src/lib/db/schema/app";
import { user } from "../src/lib/db/schema/auth";
import { closeWorkerDb, workerDb } from "../src/lib/db/worker";

const HOUR = 60 * 60 * 1000;
const CHECK_COUNT = 24;

const monitorSeeds = [
	{
		name: "Production API",
		url: "https://jsonplaceholder.typicode.com/posts/1",
		intervalSeconds: 3600,
		timeoutMs: 10000,
		enabled: true,
	},
	{
		name: "Product API",
		url: "https://dummyjson.com/products/1",
		intervalSeconds: 3600,
		timeoutMs: 10000,
		enabled: true,
	},
	{
		name: "Payment Gateway",
		url: "https://httpbin.org/status/503",
		intervalSeconds: 3600,
		timeoutMs: 10000,
		enabled: true,
	},
	{
		name: "Authentication Service",
		url: "https://httpbin.org/delay/10",
		intervalSeconds: 3600,
		timeoutMs: 2000,
		enabled: true,
	},
	{
		name: "Legacy API",
		url: "https://httpbin.org/status/500",
		intervalSeconds: 3600,
		timeoutMs: 10000,
		enabled: true,
	},
] as const;

const monitorIds = monitorSeeds.map(
	(_, index) =>
		`10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

function checkId(index: number): string {
	return `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function incidentId(index: number): string {
	return `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

type CheckStatus = "up" | "down" | "timeout";

function getCheckStatus(monitorIndex: number, checkIndex: number): CheckStatus {
	if (monitorIndex === 0 && checkIndex >= 13 && checkIndex <= 15) {
		return "down";
	}

	if (monitorIndex === 1 && checkIndex === 7) {
		return "down";
	}

	if (monitorIndex === 2 && checkIndex >= 20) {
		return "down";
	}

	if (monitorIndex === 3 && checkIndex >= 22) {
		return "timeout";
	}

	if (monitorIndex === 4 && checkIndex >= 6 && checkIndex <= 7) {
		return "down";
	}

	return "up";
}

function getCheckDetails(monitorIndex: number, status: CheckStatus) {
	if (status === "timeout") {
		return {
			httpStatus: null,
			latencyMs: 2000,
			errorMessage: "Request timed out",
		};
	}

	if (status === "down") {
		const httpStatus = monitorIndex === 2 ? 503 : 500;

		return {
			httpStatus,
			latencyMs: 250,
			errorMessage: `HTTP ${httpStatus}`,
		};
	}

	return {
		httpStatus: 200,
		latencyMs: 120 + monitorIndex * 35,
		errorMessage: null,
	};
}

async function seed(): Promise<void> {
	const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();

	if (!email) {
		throw new Error("SEED_USER_EMAIL is not configured");
	}

	const [existingUser] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);

	if (!existingUser) {
		throw new Error("No Sentinel account found for SEED_USER_EMAIL");
	}

	const now = Date.now();

	const checkRows = monitorSeeds.flatMap((_, monitorIndex) =>
		Array.from({ length: CHECK_COUNT }, (_, checkIndex) => {
			const status = getCheckStatus(monitorIndex, checkIndex);
			const details = getCheckDetails(monitorIndex, status);
			const rowIndex = monitorIndex * CHECK_COUNT + checkIndex;

			return {
				id: checkId(rowIndex),
				monitorId: monitorIds[monitorIndex],
				checkedAt: new Date(now - (CHECK_COUNT - 1 - checkIndex) * HOUR),
				status,
				...details,
			};
		}),
	);

	const incidentRows = [
		{
			id: incidentId(0),
			monitorId: monitorIds[0],
			startedAt: new Date(now - 10 * HOUR),
			resolvedAt: new Date(now - 7 * HOUR),
			reason: "HTTP 500",
		},
		{
			id: incidentId(1),
			monitorId: monitorIds[1],
			startedAt: new Date(now - 16 * HOUR),
			resolvedAt: new Date(now - 15 * HOUR),
			reason: "HTTP 500",
		},
		{
			id: incidentId(2),
			monitorId: monitorIds[2],
			startedAt: new Date(now - 3 * HOUR),
			resolvedAt: null,
			reason: "HTTP 503",
		},
		{
			id: incidentId(3),
			monitorId: monitorIds[3],
			startedAt: new Date(now - HOUR),
			resolvedAt: null,
			reason: "Request timed out",
		},
		{
			id: incidentId(4),
			monitorId: monitorIds[4],
			startedAt: new Date(now - 17 * HOUR),
			resolvedAt: new Date(now - 15 * HOUR),
			reason: "HTTP 500",
		},
	];

	await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${existingUser.id}, true)`,
		);

		await tx
			.insert(monitors)
			.values(
				monitorSeeds.map((monitor, index) => ({
					...monitor,
					id: monitorIds[index],
					ownerId: existingUser.id,
				})),
			)
			.onConflictDoNothing();

		const ownedMonitors = await tx
			.select({ id: monitors.id })
			.from(monitors)
			.where(
				and(
					eq(monitors.ownerId, existingUser.id),
					inArray(monitors.id, monitorIds),
				),
			);

		if (ownedMonitors.length !== monitorSeeds.length) {
			throw new Error("A seed monitor ID conflicts with another account.");
		}

		await tx
			.update(monitors)
			.set({ enabled: true })
			.where(inArray(monitors.id, monitorIds));
	});

	await workerDb.transaction(async (tx) => {
		await tx.insert(checkResults).values(checkRows).onConflictDoNothing();

		await tx.insert(incidents).values(incidentRows).onConflictDoNothing();
	});

	await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${existingUser.id}, true)`,
		);

		await tx
			.update(monitors)
			.set({ enabled: false })
			.where(inArray(monitors.id, [monitorIds[3], monitorIds[4]]));
	});

	console.info("Sentinel seed completed.");
	console.info(`Account: ${email}`);
	console.info(`Monitors: ${monitorSeeds.length}`);
	console.info(`Check results: ${checkRows.length}`);
	console.info(`Incidents: ${incidentRows.length}`);
	console.info("Authentication Service and Legacy API disabled.");
}

seed()
	.catch((error: unknown) => {
		console.error("Sentinel seed failed:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await Promise.all([closeDb(), closeWorkerDb()]);
	});
