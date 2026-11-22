import { describe, expect, it } from "vitest";
import {
	DEFAULT_INTERVAL_SECONDS,
	DEFAULT_TIMEOUT_MS,
	DEFAULT_USER_SETTINGS,
	MAX_INTERVAL_SECONDS,
	MAX_TIMEOUT_MS,
	MIN_INTERVAL_SECONDS,
	MIN_TIMEOUT_MS,
	validateUserSettings,
} from "./user-settings";

const valid = { defaultIntervalSeconds: 120, defaultTimeoutMs: 5_000 };

describe("DEFAULT_USER_SETTINGS", () => {
	it("matches the database column defaults", () => {
		expect(DEFAULT_USER_SETTINGS).toEqual({
			defaultIntervalSeconds: DEFAULT_INTERVAL_SECONDS,
			defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
		});
		expect(DEFAULT_INTERVAL_SECONDS).toBe(300);
		expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
	});
});

describe("validateUserSettings", () => {
	it("accepts valid settings", () => {
		expect(validateUserSettings(valid)).toEqual({
			valid: true,
			settings: valid,
		});
	});

	it("accepts values exactly at the bounds", () => {
		expect(
			validateUserSettings({
				defaultIntervalSeconds: MIN_INTERVAL_SECONDS,
				defaultTimeoutMs: MIN_TIMEOUT_MS,
			}),
		).toMatchObject({ valid: true });

		expect(
			validateUserSettings({
				defaultIntervalSeconds: MAX_INTERVAL_SECONDS,
				defaultTimeoutMs: MAX_TIMEOUT_MS,
			}),
		).toMatchObject({ valid: true });
	});

	it("rejects an interval outside the bounds", () => {
		for (const defaultIntervalSeconds of [
			MIN_INTERVAL_SECONDS - 1,
			MAX_INTERVAL_SECONDS + 1,
			0,
			-60,
		]) {
			const result = validateUserSettings({ ...valid, defaultIntervalSeconds });

			expect(result, String(defaultIntervalSeconds)).toMatchObject({
				valid: false,
			});
		}
	});

	it("rejects a timeout outside the bounds", () => {
		for (const defaultTimeoutMs of [
			MIN_TIMEOUT_MS - 1,
			MAX_TIMEOUT_MS + 1,
			0,
			-1000,
		]) {
			const result = validateUserSettings({ ...valid, defaultTimeoutMs });

			expect(result, String(defaultTimeoutMs)).toMatchObject({ valid: false });
		}
	});

	it("rejects non-integer numbers", () => {
		expect(
			validateUserSettings({ ...valid, defaultIntervalSeconds: 90.5 }),
		).toMatchObject({ valid: false });
		expect(
			validateUserSettings({ ...valid, defaultTimeoutMs: 2_500.5 }),
		).toMatchObject({ valid: false });
	});

	it("rejects NaN and Infinity", () => {
		expect(
			validateUserSettings({ ...valid, defaultIntervalSeconds: Number.NaN }),
		).toMatchObject({ valid: false });
		expect(
			validateUserSettings({
				...valid,
				defaultTimeoutMs: Number.POSITIVE_INFINITY,
			}),
		).toMatchObject({ valid: false });
	});

	it("rejects numeric strings instead of coercing them", () => {
		expect(
			validateUserSettings({ ...valid, defaultIntervalSeconds: "120" }),
		).toMatchObject({ valid: false });
		expect(
			validateUserSettings({ ...valid, defaultTimeoutMs: "5000" }),
		).toMatchObject({ valid: false });
	});

	it("rejects missing fields", () => {
		expect(validateUserSettings({ defaultIntervalSeconds: 120 })).toMatchObject(
			{ valid: false },
		);
		expect(validateUserSettings({ defaultTimeoutMs: 5_000 })).toMatchObject({
			valid: false,
		});
		expect(validateUserSettings({})).toMatchObject({ valid: false });
	});

	it("rejects unsupported fields such as an owner id", () => {
		expect(validateUserSettings({ ...valid, userId: "another-user" })).toEqual({
			valid: false,
			error: "Unsupported fields in request",
		});
	});

	it("rejects bodies that are not plain objects", () => {
		for (const body of [null, undefined, "settings", 42, [valid]]) {
			expect(validateUserSettings(body), String(body)).toMatchObject({
				valid: false,
			});
		}
	});

	it("only returns the two known fields", () => {
		const result = validateUserSettings(valid);

		expect(result.valid && Object.keys(result.settings).sort()).toEqual([
			"defaultIntervalSeconds",
			"defaultTimeoutMs",
		]);
	});
});
