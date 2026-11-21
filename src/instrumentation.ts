export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") {
		return;
	}

	const { assertWebEnv } = await import("@/lib/env");

	assertWebEnv();
}
