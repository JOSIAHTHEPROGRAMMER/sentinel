import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

const connectionString = process.env.MIGRATION_DATABASE_URL;

if (!connectionString) {
	throw new Error("MIGRATION_DATABASE_URL is not configured");
}

export default defineConfig({
	schema: ["./src/lib/db/schema/auth.ts", "./src/lib/db/schema/app.ts"],
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: connectionString,
	},
	migrations: {
		schema: "app",
		table: "__drizzle_migrations",
	},
});
