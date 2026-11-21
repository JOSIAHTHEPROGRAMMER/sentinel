import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema/app";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.MONITOR_WORKER_DATABASE_URL;

if (!connectionString) {
	throw new Error("MONITOR_WORKER_DATABASE_URL is not configured");
}

const pool = new Pool({
	connectionString,
	connectionTimeoutMillis: 10_000,
	idleTimeoutMillis: 30_000,
});

pool.on("error", (error: Error) => {
	console.error("Worker database pool error:", error);
});

export const workerDb = drizzle({
	client: pool,
	schema,
});

export async function closeWorkerDb(): Promise<void> {
	await pool.end();
}
