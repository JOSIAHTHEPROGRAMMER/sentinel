import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const { Client } = pg;

if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL is not configured");
}

const firstUserId = process.env.RLS_TEST_USER_A;
const secondUserId = process.env.RLS_TEST_USER_B;

if (!firstUserId || !secondUserId) {
	throw new Error(
		"Set RLS_TEST_USER_A and RLS_TEST_USER_B before running this test",
	);
}

if (firstUserId === secondUserId) {
	throw new Error("The two test user IDs must be different");
}

const client = new Client({
	connectionString: process.env.DATABASE_URL,
});

async function setUserContext(userId) {
	await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
}

async function visibleMonitorIds(userId) {
	await setUserContext(userId);

	const result = await client.query("SELECT id FROM app.monitors ORDER BY id");

	return result.rows.map((row) => row.id);
}

try {
	await client.connect();
	await client.query("BEGIN");

	const role = await client.query("SELECT current_user");

	if (role.rows[0].current_user !== "sentinel_app") {
		throw new Error(`Expected sentinel_app, got ${role.rows[0].current_user}`);
	}

	await setUserContext(firstUserId);

	const firstMonitor = await client.query(
		`INSERT INTO app.monitors (owner_id, name, url)
		 VALUES ($1, $2, $3)
		 RETURNING id`,
		[firstUserId, "RLS Test A", "https://example.com"],
	);

	await setUserContext(secondUserId);

	const secondMonitor = await client.query(
		`INSERT INTO app.monitors (owner_id, name, url)
		 VALUES ($1, $2, $3)
		 RETURNING id`,
		[secondUserId, "RLS Test B", "https://example.org"],
	);

	const firstId = firstMonitor.rows[0].id;
	const secondId = secondMonitor.rows[0].id;

	const firstVisible = await visibleMonitorIds(firstUserId);
	const secondVisible = await visibleMonitorIds(secondUserId);

	const firstPass =
		firstVisible.includes(firstId) && !firstVisible.includes(secondId);

	const secondPass =
		secondVisible.includes(secondId) && !secondVisible.includes(firstId);

	console.log("Runtime role:", role.rows[0].current_user);
	console.log("User A sees only their monitor:", firstPass);
	console.log("User B sees only their monitor:", secondPass);

	if (!firstPass || !secondPass) {
		throw new Error("RLS isolation test failed");
	}

	console.log("RLS isolation test passed.");
} catch (error) {
	console.error("RLS isolation test failed:", error.message);
	process.exitCode = 1;
} finally {
	try {
		await client.query("ROLLBACK");
		console.log("Test transaction rolled back.");
	} catch {
		// The transaction may not have started.
	}

	await client.end().catch(() => {});
}
