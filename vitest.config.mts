import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		include: ["src/**/*.test.ts"],
		exclude: [...configDefaults.exclude, "src/**/*.integration.test.ts"],
	},
});
