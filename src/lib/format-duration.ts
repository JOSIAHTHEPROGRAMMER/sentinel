export function formatDurationMs(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));

	if (totalSeconds < 60) {
		return `${totalSeconds}s`;
	}

	const totalMinutes = Math.floor(totalSeconds / 60);

	if (totalMinutes < 60) {
		return `${totalMinutes}m`;
	}

	const totalHours = Math.floor(totalMinutes / 60);

	if (totalHours < 24) {
		return `${totalHours}h ${totalMinutes % 60}m`;
	}

	return `${Math.floor(totalHours / 24)}d ${totalHours % 24}h`;
}
