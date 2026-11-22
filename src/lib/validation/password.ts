export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export function validateNewPassword(
	currentPassword: string,
	newPassword: string,
	confirmation: string,
): string | null {
	if (newPassword.length < MIN_PASSWORD_LENGTH) {
		return `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
	}

	if (newPassword.length > MAX_PASSWORD_LENGTH) {
		return `New password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
	}

	if (newPassword === currentPassword) {
		return "New password must be different from your current password.";
	}

	if (newPassword !== confirmation) {
		return "The new password and its confirmation do not match.";
	}

	return null;
}
