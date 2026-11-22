const MINUTES_PER_DAY = 24 * 60;

export const DEFAULT_GRACE_MINUTES = 30 * MINUTES_PER_DAY;
export const MIN_GRACE_MINUTES = 1;
export const MAX_GRACE_MINUTES = 365 * MINUTES_PER_DAY;

export function getGraceMinutes(
	value: string | undefined = process.env.ACCOUNT_DELETION_GRACE_MINUTES,
): number {
	if (value === undefined || value.trim() === "") {
		return DEFAULT_GRACE_MINUTES;
	}

	const parsed = Number(value);

	// A bad value falls back to the long default, the safer side for a deletion
	if (
		!Number.isInteger(parsed) ||
		parsed < MIN_GRACE_MINUTES ||
		parsed > MAX_GRACE_MINUTES
	) {
		return DEFAULT_GRACE_MINUTES;
	}

	return parsed;
}

export function computePurgeAfter(now: Date, graceMinutes: number): Date {
	return new Date(now.getTime() + graceMinutes * 60_000);
}
