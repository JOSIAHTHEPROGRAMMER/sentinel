import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		include: ["src/**/*.integration.test.ts"],
		setupFiles: ["src/test/integration/setup.ts"],
		// Vitest doesn't read .env.local on its own
		env: loadEnv("integration", process.cwd(), ""),
		fileParallelism: false,
		testTimeout: 30_000,
		hookTimeout: 30_000,
	},
});
