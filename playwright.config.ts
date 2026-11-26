import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });

if (process.env.ALLOW_INTEGRATION_TESTS !== "true") {
	throw new Error(
		"End-to-end tests write to the database in .env.local. Set ALLOW_INTEGRATION_TESTS=true to run them.",
	);
}

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

const inheritedEnv = Object.fromEntries(
	Object.entries(process.env).filter(
		(entry): entry is [string, string] => entry[1] !== undefined,
	),
);

export default defineConfig({
	testDir: "e2e",
	testMatch: "**/*.spec.ts",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 60_000,
	reporter: [["list"], ["html", { open: "never" }]],
	globalSetup: "./e2e/global-setup.ts",
	use: {
		baseURL: BASE_URL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: `npm run build && npm run start -- --port ${PORT}`,
		url: `${BASE_URL}/sign-in`,
		timeout: 300_000,
		reuseExistingServer: false,
		stdout: "pipe",
		env: {
			...inheritedEnv,
			BETTER_AUTH_URL: BASE_URL,
			BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-0123456789",
		},
	},
});
