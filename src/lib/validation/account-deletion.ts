import { MAX_PASSWORD_LENGTH } from "./password";

export type DeletionRequestValidation =
	| { valid: true; password: string }
	| { valid: false; error: string };

export function validateDeletionRequest(
	input: unknown,
	accountEmail: string,
): DeletionRequestValidation {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return { valid: false, error: "Request body must be an object" };
	}

	const body = input as Record<string, unknown>;

	if (Object.keys(body).some((key) => key !== "password" && key !== "email")) {
		return { valid: false, error: "Unsupported fields in request" };
	}

	if (
		typeof body.password !== "string" ||
		body.password.length === 0 ||
		body.password.length > MAX_PASSWORD_LENGTH
	) {
		return { valid: false, error: "Your password is required" };
	}

	if (
		typeof body.email !== "string" ||
		body.email.trim().toLowerCase() !== accountEmail.trim().toLowerCase()
	) {
		return {
			valid: false,
			error: "The email you typed does not match your account email",
		};
	}

	return { valid: true, password: body.password };
}
