import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { createLeaseStore, DEFAULT_LEASE_SECONDS } from "./lease-store";

const dialect = new PgDialect();

function render(query: SQL) {
	const { sql: text, params } = dialect.sqlToQuery(query);

	return { text: text.replace(/\s+/g, " ").toLowerCase(), params };
}

const monitorA = "32bc70f6-c55f-4034-8bd7-f45bc84abab0";
const monitorB = "10000000-0000-4000-8000-000000000001";

describe("lease store", () => {
	let execute: Mock<(query: SQL) => Promise<{ rows: unknown[] }>>;

	beforeEach(() => {
		execute = vi.fn(async () => ({ rows: [] }));
	});

	function createStore(owner = "worker-1") {
		return createLeaseStore({ execute, owner });
	}

	describe("claimDue", () => {
		it("does nothing when there is no free capacity", async () => {
			const claimed = await createStore().claimDue(0);

			expect(claimed).toEqual([]);
			expect(execute).not.toHaveBeenCalled();
		});

		it("creates missing lease rows before claiming", async () => {
			await createStore().claimDue(5);

			expect(execute).toHaveBeenCalledTimes(2);

			const first = render(execute.mock.calls[0]?.[0] as SQL);

			expect(first.text).toContain("insert into app.monitor_leases");
			expect(first.text).toContain("on conflict (monitor_id) do nothing");
			expect(first.text).toContain("enabled = true");
			expect(first.text).toContain("deleted_at is null");
		});

		it("returns the ids of the claimed monitors", async () => {
			execute.mockResolvedValueOnce({ rows: [] });
			execute.mockResolvedValueOnce({
				rows: [{ monitor_id: monitorA }, { monitor_id: monitorB }],
			});

			expect(await createStore().claimDue(5)).toEqual([monitorA, monitorB]);
		});

		it("claims with SKIP LOCKED so concurrent workers do not collide", async () => {
			await createStore().claimDue(5);

			const claim = render(execute.mock.calls[1]?.[0] as SQL);

			expect(claim.text).toContain("for update of l skip locked");
		});

		it("only claims enabled, non-deleted monitors that are not leased", async () => {
			await createStore().claimDue(5);

			const claim = render(execute.mock.calls[1]?.[0] as SQL);

			expect(claim.text).toContain("m.enabled = true");
			expect(claim.text).toContain("m.deleted_at is null");
			expect(claim.text).toContain(
				"l.lease_until is null or l.lease_until <= now()",
			);
		});

		it("computes the due time from the monitor's current interval", async () => {
			await createStore().claimDue(5);

			const claim = render(execute.mock.calls[1]?.[0] as SQL);

			expect(claim.text).toContain("l.last_started_at is null");
			expect(claim.text).toContain("greatest(m.interval_seconds, 1)");
			expect(claim.text).toContain("<= now()");
		});

		it("orders never-checked monitors first, then the most overdue", async () => {
			await createStore().claimDue(5);

			const claim = render(execute.mock.calls[1]?.[0] as SQL);

			expect(claim.text).toContain("asc nulls first");
		});

		it("passes the limit, the owner and the lease length as parameters", async () => {
			await createStore("worker-7").claimDue(3);

			const claim = render(execute.mock.calls[1]?.[0] as SQL);

			expect(claim.params).toContain(3);
			expect(claim.params).toContain("worker-7");
			expect(claim.params).toContain(DEFAULT_LEASE_SECONDS);
		});

		it("returns an empty list when nothing is due", async () => {
			expect(await createStore().claimDue(5)).toEqual([]);
		});

		it("lets a database failure propagate to the caller", async () => {
			execute.mockRejectedValue(new Error("Database unavailable"));

			await expect(createStore().claimDue(5)).rejects.toThrow(
				"Database unavailable",
			);
		});
	});

	describe("release", () => {
		it("clears the lease and anchors the next due time to the claim time", async () => {
			await createStore().release(monitorA);

			const release = render(execute.mock.calls[0]?.[0] as SQL);

			expect(release.text).toContain("update app.monitor_leases");
			expect(release.text).toContain(
				"last_started_at = lease_until - make_interval(secs =>",
			);
			expect(release.text).toContain("lease_owner = null");
			expect(release.text).toContain("lease_until = null");
		});

		it("only releases a lease that this worker still owns", async () => {
			await createStore("worker-1").release(monitorA);

			const release = render(execute.mock.calls[0]?.[0] as SQL);

			expect(release.text).toContain("lease_owner = $");
			expect(release.params).toContain(monitorA);
			expect(release.params).toContain("worker-1");
		});

		it("lets a database failure propagate to the caller", async () => {
			execute.mockRejectedValue(new Error("Database unavailable"));

			await expect(createStore().release(monitorA)).rejects.toThrow(
				"Database unavailable",
			);
		});
	});

	it("exposes its owner id", () => {
		expect(createStore("worker-9").owner).toBe("worker-9");
	});

	it("uses a lease longer than the scheduler's 60 second check cap", () => {
		expect(DEFAULT_LEASE_SECONDS).toBeGreaterThan(60);
	});
});
