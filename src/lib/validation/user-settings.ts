export const DEFAULT_INTERVAL_SECONDS = 300;
export const DEFAULT_TIMEOUT_MS = 10_000;

export const MIN_INTERVAL_SECONDS = 60;
export const MAX_INTERVAL_SECONDS = 86_400;
export const MIN_TIMEOUT_MS = 1_000;
export const MAX_TIMEOUT_MS = 30_000;

export type UserSettings = {
	defaultIntervalSeconds: number;
	defaultTimeoutMs: number;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
	defaultIntervalSeconds: DEFAULT_INTERVAL_SECONDS,
	defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
};

export type UserSettingsValidation =
	| { valid: true; settings: UserSettings }
	| { valid: false; error: string };

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= min &&
		value <= max
	);
}

export function validateUserSettings(input: unknown): UserSettingsValidation {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return { valid: false, error: "Request body must be an object" };
	}

	const body = input as Record<string, unknown>;
	const allowed = ["defaultIntervalSeconds", "defaultTimeoutMs"];

	if (Object.keys(body).some((key) => !allowed.includes(key))) {
		return { valid: false, error: "Unsupported fields in request" };
	}

	if (
		!isIntegerInRange(
			body.defaultIntervalSeconds,
			MIN_INTERVAL_SECONDS,
			MAX_INTERVAL_SECONDS,
		)
	) {
		return {
			valid: false,
			error: `Interval must be between ${MIN_INTERVAL_SECONDS} and ${MAX_INTERVAL_SECONDS} seconds`,
		};
	}

	if (
		!isIntegerInRange(body.defaultTimeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
	) {
		return {
			valid: false,
			error: `Timeout must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} milliseconds`,
		};
	}

	return {
		valid: true,
		settings: {
			defaultIntervalSeconds: body.defaultIntervalSeconds as number,
			defaultTimeoutMs: body.defaultTimeoutMs as number,
		},
	};
}
