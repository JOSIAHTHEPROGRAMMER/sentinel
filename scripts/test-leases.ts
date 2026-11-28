import { sql } from "drizzle-orm";
import { closeWorkerDb, workerDb } from "@/lib/db/worker";
import { createLeaseStore } from "@/lib/monitoring/lease-store";

type LeaseRow = {
	monitor_id: string;
	last_started_at: string | null;
	lease_owner: string | null;
	lease_until: string | null;
};

const execute = (query: Parameters<typeof workerDb.execute>[0]) =>
	workerDb.execute(query);

const results: { name: string; ok: boolean }[] = [];

function check(name: string, ok: boolean, detail = ""): void {
	results.push({ name, ok });
	console.log(
		`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
	);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readLeases(): Promise<LeaseRow[]> {
	const result = await execute(sql`
		SELECT monitor_id::text AS monitor_id,
			last_started_at::text AS last_started_at,
			lease_owner,
			lease_until::text AS lease_until
		FROM app.monitor_leases
		ORDER BY monitor_id
	`);

	return result.rows as LeaseRow[];
}

async function makeAllDue(): Promise<void> {
	await execute(sql`
		UPDATE app.monitor_leases
		SET last_started_at = NULL, lease_owner = NULL, lease_until = NULL
	`);
}

async function ownerOf(monitorId: string): Promise<string | null> {
	const rows = await readLeases();

	return rows.find((row) => row.monitor_id === monitorId)?.lease_owner ?? null;
}

async function restore(snapshot: LeaseRow[]): Promise<void> {
	for (const row of snapshot) {
		await execute(sql`
			UPDATE app.monitor_leases
			SET last_started_at = ${row.last_started_at}::timestamptz,
				lease_owner = ${row.lease_owner},
				lease_until = ${row.lease_until}::timestamptz
			WHERE monitor_id = ${row.monitor_id}::uuid
		`);
	}
}

async function main(): Promise<void> {
	const snapshot = await readLeases();

	if (snapshot.length < 2) {
		console.log("Need at least 2 lease rows. Run a worker once, then stop it.");
		return;
	}

	const busy = snapshot.filter(
		(row) => row.lease_until && new Date(row.lease_until) > new Date(),
	);

	if (busy.length > 0) {
		console.log(
			`${busy.length} monitor(s) are leased right now. Stop every worker first, wait a minute, and rerun.`,
		);
		return;
	}

	console.log(
		`Testing with ${snapshot.length} monitors. Their lease rows are restored afterwards.\n`,
	);

	try {
		// 1. Five workers claiming at the same instant must never share a monitor
		await makeAllDue();

		const owners = ["w1", "w2", "w3", "w4", "w5"];
		const stores = owners.map((owner) => createLeaseStore({ execute, owner }));

		// Each worker claims one monitor at a time until nothing is left, so the
		// five workers genuinely compete for the same rows
		const claims: string[][] = owners.map(() => []);

		await Promise.all(
			stores.map(async (store, index) => {
				for (;;) {
					const [id] = await store.claimDue(1);

					if (!id) {
						return;
					}

					claims[index]?.push(id);
					await sleep(20);
				}
			}),
		);

		const all = claims.flat();
		const unique = new Set(all);

		check(
			"concurrent claims never overlap",
			all.length === unique.size,
			`${all.length} claims, ${unique.size} unique`,
		);
		check(
			"every due monitor is claimed by someone",
			unique.size === snapshot.length,
			`${unique.size} of ${snapshot.length}`,
		);
		check(
			"work is shared between workers",
			claims.filter((claim) => claim.length > 0).length >= 2,
			`${claims.filter((claim) => claim.length > 0).length} workers got work`,
		);
		console.log(
			`      split: ${owners.map((owner, index) => `${owner}=${claims[index]?.length}`).join(" ")}`,
		);

		// 2. A leased monitor is not claimable by anyone else
		const bystander = createLeaseStore({ execute, owner: "w6" });
		const again = await bystander.claimDue(1000);

		check(
			"a leased monitor cannot be claimed again",
			again.length === 0,
			`${again.length} claimed`,
		);

		// 3. Only the owner can release a lease
		const sampleOwnerIndex = claims.findIndex((claim) => claim.length > 0);
		const sampleId = claims[sampleOwnerIndex]?.[0] ?? "";
		const sampleOwner = owners[sampleOwnerIndex] ?? "";

		await bystander.release(sampleId);

		check(
			"a non-owner cannot release a lease",
			(await ownerOf(sampleId)) === sampleOwner,
			`owner still ${await ownerOf(sampleId)}`,
		);

		// 4. The owner releases; the monitor is then not due until its interval passes
		for (const [index, store] of stores.entries()) {
			for (const id of claims[index] ?? []) {
				await store.release(id);
			}
		}

		const afterRelease = await readLeases();

		check(
			"releasing clears every lease",
			afterRelease.every(
				(row) => row.lease_owner === null && row.lease_until === null,
			),
		);
		check(
			"released monitors record when they started",
			afterRelease.every((row) => row.last_started_at !== null),
		);

		const notDue = await bystander.claimDue(1000);

		check(
			"a monitor is not due again right after a check",
			notDue.length === 0,
			`${notDue.length} claimed`,
		);

		// 5. A dead worker's lease expires and another worker takes over
		await makeAllDue();

		const dying = createLeaseStore({
			execute,
			owner: "dying",
			leaseSeconds: 3,
		});
		const rescuer = createLeaseStore({
			execute,
			owner: "rescuer",
			leaseSeconds: 3,
		});

		const held = await dying.claimDue(1000);
		const tooEarly = await rescuer.claimDue(1000);

		check(
			"a live lease blocks other workers",
			tooEarly.length === 0,
			`${tooEarly.length} claimed`,
		);

		console.log("      waiting 4 seconds for the lease to expire...");
		await sleep(4000);

		const takenOver = await rescuer.claimDue(1000);

		check(
			"an expired lease is taken over",
			takenOver.length === held.length && held.length > 0,
			`${takenOver.length} of ${held.length}`,
		);

		// 6. The dead worker waking up late must not undo the takeover
		const victim = held[0] ?? "";

		await dying.release(victim);

		check(
			"a stale owner cannot release the new owner's lease",
			(await ownerOf(victim)) === "rescuer",
			`owner is ${await ownerOf(victim)}`,
		);
	} finally {
		await restore(snapshot);
		console.log("\nLease rows restored.");
	}

	const failed = results.filter((result) => !result.ok).length;

	console.log(`\n${results.length - failed} passed, ${failed} failed`);
	process.exitCode = failed > 0 ? 1 : 0;
}

main()
	.catch((error) => {
		console.error("Test run failed:", error);
		process.exitCode = 1;
	})
	.finally(() => closeWorkerDb());
