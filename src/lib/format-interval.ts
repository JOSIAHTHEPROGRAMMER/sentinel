export function formatInterval(seconds: number): string {
	if (seconds >= 3600 && seconds % 3600 === 0) {
		const hours = seconds / 3600;

		return `${hours} hour${hours === 1 ? "" : "s"}`;
	}

	if (seconds >= 60 && seconds % 60 === 0) {
		return `${seconds / 60} min`;
	}

	return `${seconds} sec`;
}
