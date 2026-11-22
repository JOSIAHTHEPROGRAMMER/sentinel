import { describe, expect, it } from "vitest";
import { validateDeletionRequest } from "./account-deletion";
import { MAX_PASSWORD_LENGTH } from "./password";

const email = "owner@example.com";
const valid = { password: "my-current-password", email };

describe("validateDeletionRequest", () => {
	it("accepts a password and a matching email", () => {
		expect(validateDeletionRequest(valid, email)).toEqual({
			valid: true,
			password: "my-current-password",
		});
	});

	it("matches the email ignoring case and surrounding whitespace", () => {
		expect(
			validateDeletionRequest(
				{ ...valid, email: "  Owner@Example.COM " },
				email,
			),
		).toMatchObject({ valid: true });
	});

	it("rejects an email that does not match the account", () => {
		expect(
			validateDeletionRequest({ ...valid, email: "other@example.com" }, email),
		).toEqual({
			valid: false,
			error: "The email you typed does not match your account email",
		});
	});

	it("rejects a missing email", () => {
		expect(
			validateDeletionRequest({ password: valid.password }, email),
		).toMatchObject({ valid: false });
	});

	it("rejects a non-string email", () => {
		expect(
			validateDeletionRequest({ ...valid, email: 123 }, email),
		).toMatchObject({ valid: false });
	});

	it("rejects a missing or empty password", () => {
		expect(validateDeletionRequest({ email }, email)).toMatchObject({
			valid: false,
		});
		expect(
			validateDeletionRequest({ ...valid, password: "" }, email),
		).toMatchObject({ valid: false });
	});

	it("rejects a non-string password", () => {
		expect(
			validateDeletionRequest({ ...valid, password: 12345678 }, email),
		).toMatchObject({ valid: false });
	});

	it("rejects a password longer than the maximum", () => {
		expect(
			validateDeletionRequest(
				{ ...valid, password: "a".repeat(MAX_PASSWORD_LENGTH + 1) },
				email,
			),
		).toMatchObject({ valid: false });
	});

	it("accepts a password exactly at the maximum length", () => {
		expect(
			validateDeletionRequest(
				{ ...valid, password: "a".repeat(MAX_PASSWORD_LENGTH) },
				email,
			),
		).toMatchObject({ valid: true });
	});

	it("does not trim the password", () => {
		const result = validateDeletionRequest(
			{ ...valid, password: "  padded  " },
			email,
		);

		expect(result).toEqual({ valid: true, password: "  padded  " });
	});

	it("rejects unsupported fields such as a user id", () => {
		expect(
			validateDeletionRequest({ ...valid, userId: "another-user" }, email),
		).toEqual({ valid: false, error: "Unsupported fields in request" });
	});

	it("rejects bodies that are not plain objects", () => {
		for (const body of [null, undefined, "delete", 42, [valid]]) {
			expect(validateDeletionRequest(body, email), String(body)).toMatchObject({
				valid: false,
			});
		}
	});
});
