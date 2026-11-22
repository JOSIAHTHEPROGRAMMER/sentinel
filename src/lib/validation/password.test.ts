import { describe, expect, it } from "vitest";
import {
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	validateNewPassword,
} from "./password";

const current = "current-password-1";
const valid = "a-brand-new-password";

describe("validateNewPassword", () => {
	it("accepts a valid new password with a matching confirmation", () => {
		expect(validateNewPassword(current, valid, valid)).toBeNull();
	});

	it("rejects a password shorter than the minimum", () => {
		const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);

		expect(validateNewPassword(current, short, short)).toContain(
			`at least ${MIN_PASSWORD_LENGTH}`,
		);
	});

	it("accepts a password exactly at the minimum length", () => {
		const exact = "a".repeat(MIN_PASSWORD_LENGTH);

		expect(validateNewPassword(current, exact, exact)).toBeNull();
	});

	it("rejects a password longer than the maximum", () => {
		const long = "a".repeat(MAX_PASSWORD_LENGTH + 1);

		expect(validateNewPassword(current, long, long)).toContain(
			`at most ${MAX_PASSWORD_LENGTH}`,
		);
	});

	it("accepts a password exactly at the maximum length", () => {
		const exact = "a".repeat(MAX_PASSWORD_LENGTH);

		expect(validateNewPassword(current, exact, exact)).toBeNull();
	});

	it("rejects a new password identical to the current one", () => {
		expect(validateNewPassword(valid, valid, valid)).toContain("different");
	});

	it("rejects a confirmation that does not match", () => {
		expect(validateNewPassword(current, valid, `${valid}x`)).toContain(
			"do not match",
		);
	});

	it("reports the length problem before the confirmation mismatch", () => {
		expect(validateNewPassword(current, "short", "other")).toContain(
			"at least",
		);
	});

	it("does not trim whitespace from passwords", () => {
		const padded = `  ${valid}  `;

		expect(validateNewPassword(current, padded, padded)).toBeNull();
		expect(validateNewPassword(current, padded, valid)).toContain(
			"do not match",
		);
	});
});
