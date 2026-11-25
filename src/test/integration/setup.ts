import { vi } from "vitest";

vi.mock("server-only", () => ({}));

// Integration tests write to whatever database the env points at, so they
// refuse to run unless this machine has explicitly opted in
if (process.env.ALLOW_INTEGRATION_TESTS !== "true") {
	throw new Error(
		"Integration tests are disabled. Set ALLOW_INTEGRATION_TESTS=true in .env.local to run them.",
	);
}

if (process.env.NODE_ENV === "production") {
	throw new Error("Integration tests must never run with NODE_ENV=production.");
}

for (const name of ["DATABASE_URL", "MONITOR_WORKER_DATABASE_URL"]) {
	if (!process.env[name]) {
		throw new Error(`${name} is not set; integration tests need it.`);
	}
}
