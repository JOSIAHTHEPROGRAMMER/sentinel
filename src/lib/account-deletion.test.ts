import { describe, expect, it } from "vitest";
import {
	computePurgeAfter,
	DEFAULT_GRACE_MINUTES,
	getGraceMinutes,
	MAX_GRACE_MINUTES,
} from "./account-deletion";

describe("getGraceMinutes", () => {
	it("defaults to 30 days when the value is missing", () => {
		expect(getGraceMinutes(undefined)).toBe(DEFAULT_GRACE_MINUTES);
		expect(DEFAULT_GRACE_MINUTES).toBe(30 * 24 * 60);
	});

	it("defaults when the value is blank", () => {
		expect(getGraceMinutes("")).toBe(DEFAULT_GRACE_MINUTES);
		expect(getGraceMinutes("   ")).toBe(DEFAULT_GRACE_MINUTES);
	});

	it("accepts a short grace period for testing", () => {
		expect(getGraceMinutes("5")).toBe(5);
		expect(getGraceMinutes("1")).toBe(1);
	});

	it("accepts the maximum", () => {
		expect(getGraceMinutes(String(MAX_GRACE_MINUTES))).toBe(MAX_GRACE_MINUTES);
	});

	it("falls back to the default rather than a shorter value for bad input", () => {
		for (const value of ["0", "-5", "5.5", "abc", "NaN", "Infinity"]) {
			expect(getGraceMinutes(value), value).toBe(DEFAULT_GRACE_MINUTES);
		}
	});

	it("falls back to the default above the maximum", () => {
		expect(getGraceMinutes(String(MAX_GRACE_MINUTES + 1))).toBe(
			DEFAULT_GRACE_MINUTES,
		);
	});
});

describe("computePurgeAfter", () => {
	const now = new Date("2026-11-22T12:00:00Z");

	it("adds the grace period in minutes", () => {
		expect(computePurgeAfter(now, 5).toISOString()).toBe(
			"2026-11-22T12:05:00.000Z",
		);
		expect(computePurgeAfter(now, DEFAULT_GRACE_MINUTES).toISOString()).toBe(
			"2026-12-22T12:00:00.000Z",
		);
	});

	it("does not mutate the input date", () => {
		computePurgeAfter(now, 5);

		expect(now.toISOString()).toBe("2026-11-22T12:00:00.000Z");
	});
});
