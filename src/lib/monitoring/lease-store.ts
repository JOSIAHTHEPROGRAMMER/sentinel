import { type SQL, sql } from "drizzle-orm";

type Execute = (query: SQL) => Promise<{ rows: unknown[] }>;

type LeaseStoreOptions = {
	execute: Execute;
	owner: string;
	leaseSeconds?: number;
};

// Longer than the scheduler's 60 second cap on a single check, so a lease
// only expires when its worker has actually died
export const DEFAULT_LEASE_SECONDS = 90;

export function createLeaseStore({
	execute,
	owner,
	leaseSeconds = DEFAULT_LEASE_SECONDS,
}: LeaseStoreOptions) {
	async function ensureLeaseRows(): Promise<void> {
		await execute(sql`
			INSERT INTO app.monitor_leases (monitor_id)
			SELECT m.id
			FROM app.monitors AS m
			WHERE m.enabled = true AND m.deleted_at IS NULL
			ON CONFLICT (monitor_id) DO NOTHING
		`);
	}

	async function claimDue(limit: number): Promise<string[]> {
		if (limit <= 0) {
			return [];
		}

		await ensureLeaseRows();

		// Due time is computed from the monitor's current interval, so an interval
		// change applies on the next poll. Never-checked monitors sort first, then
		// the most overdue. SKIP LOCKED lets two workers polling at the same moment
		// claim different monitors without waiting on each other.
		const result = await execute(sql`
			WITH due AS (
				SELECT l.monitor_id
				FROM app.monitor_leases AS l
				JOIN app.monitors AS m ON m.id = l.monitor_id
				WHERE m.enabled = true
					AND m.deleted_at IS NULL
					AND (l.lease_until IS NULL OR l.lease_until <= now())
					AND (
						l.last_started_at IS NULL
						OR l.last_started_at
							+ make_interval(secs => GREATEST(m.interval_seconds, 1)::double precision)
							<= now()
					)
				ORDER BY
					l.last_started_at
						+ make_interval(secs => GREATEST(m.interval_seconds, 1)::double precision)
						ASC NULLS FIRST
				LIMIT ${limit}
				FOR UPDATE OF l SKIP LOCKED
			)
			UPDATE app.monitor_leases AS l
			SET lease_owner = ${owner},
				lease_until = now() + make_interval(secs => ${leaseSeconds}::double precision)
			FROM due
			WHERE l.monitor_id = due.monitor_id
			RETURNING l.monitor_id
		`);

		return result.rows.map((row) =>
			String((row as { monitor_id: string }).monitor_id),
		);
	}

	// The next due time counts from when the check was claimed, not when it
	// finished, which matches how the in-memory scheduler behaved. The owner
	// check means a worker whose lease expired and was taken over can't overwrite
	// the new owner's lease.
	async function release(monitorId: string): Promise<void> {
		await execute(sql`
			UPDATE app.monitor_leases
			SET last_started_at = lease_until - make_interval(secs => ${leaseSeconds}::double precision),
				lease_owner = NULL,
				lease_until = NULL
			WHERE monitor_id = ${monitorId}::uuid AND lease_owner = ${owner}
		`);
	}

	return { owner, claimDue, release };
}
