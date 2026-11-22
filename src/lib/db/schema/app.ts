import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	pgPolicy,
	pgSchema,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const appSchema = pgSchema("app");

export const checkStatus = appSchema.enum("check_status", [
	"up",
	"down",
	"timeout",
	"error",
]);

export const projects = appSchema.table(
	"projects",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("projects_id_owner_id_idx").on(table.id, table.ownerId),
		index("projects_owner_id_idx").on(table.ownerId),
		pgPolicy("projects_owner_access", {
			for: "all",
			to: "sentinel_app",
			using: sql`owner_id = current_setting('app.user_id', true)`,
			withCheck: sql`owner_id = current_setting('app.user_id', true)`,
		}),
	],
);

export const monitors = appSchema.table(
	"monitors",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		projectId: uuid("project_id"),
		name: text("name").notNull(),
		url: text("url").notNull(),
		intervalSeconds: integer("interval_seconds").default(300).notNull(),
		timeoutMs: integer("timeout_ms").default(10000).notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		deletedAt: timestamp("deleted_at", {
			withTimezone: true,
		}),
	},
	(table) => [
		index("monitors_owner_id_idx").on(table.ownerId),
		pgPolicy("monitors_owner_access", {
			for: "all",
			to: "sentinel_app",
			using: sql`owner_id = current_setting('app.user_id', true)`,
			withCheck: sql`owner_id = current_setting('app.user_id', true)`,
		}),
		index("monitors_project_id_idx").on(table.projectId),
		foreignKey({
			name: "monitors_project_owner_fk",
			columns: [table.projectId, table.ownerId],
			foreignColumns: [projects.id, projects.ownerId],
		}).onDelete("restrict"),
	],
);

export const checkResults = appSchema.table(
	"check_results",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		monitorId: uuid("monitor_id")
			.notNull()
			.references(() => monitors.id, { onDelete: "cascade" }),
		checkedAt: timestamp("checked_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		status: checkStatus("status").notNull(),
		httpStatus: integer("http_status"),
		latencyMs: integer("latency_ms"),
		errorMessage: text("error_message"),
	},
	(table) => [
		index("check_results_monitor_checked_at_idx").on(
			table.monitorId,
			table.checkedAt,
		),
		pgPolicy("check_results_owner_read", {
			for: "select",
			to: "sentinel_app",
			using: sql`EXISTS (
				SELECT 1
				FROM app.monitors AS m
				WHERE m.id = monitor_id
				AND m.owner_id = current_setting('app.user_id', true)
			)`,
		}),
	],
);

export const incidents = appSchema.table(
	"incidents",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		monitorId: uuid("monitor_id")
			.notNull()
			.references(() => monitors.id, { onDelete: "cascade" }),
		startedAt: timestamp("started_at", {
			withTimezone: true,
		})
			.defaultNow()
			.notNull(),
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
		reason: text("reason").notNull(),
	},
	(table) => [
		index("incidents_monitor_started_at_idx").on(
			table.monitorId,
			table.startedAt,
		),
		uniqueIndex("incidents_one_open_per_monitor_idx")
			.on(table.monitorId)
			.where(sql`${table.resolvedAt} IS NULL`),
		pgPolicy("incidents_owner_read", {
			for: "select",
			to: "sentinel_app",
			using: sql`EXISTS(SELECT 1 FROM app.monitors AS m WHERE m.id = monitor_id AND m.owner_id = current_setting('app.user_id', true))`,
		}),
	],
);

export const userSettings = appSchema.table(
	"user_settings",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		defaultIntervalSeconds: integer("default_interval_seconds")
			.default(300)
			.notNull(),
		defaultTimeoutMs: integer("default_timeout_ms").default(10000).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		check(
			"user_settings_interval_range",
			sql`${table.defaultIntervalSeconds} BETWEEN 60 AND 86400`,
		),
		check(
			"user_settings_timeout_range",
			sql`${table.defaultTimeoutMs} BETWEEN 1000 AND 30000`,
		),
		pgPolicy("user_settings_owner_access", {
			for: "all",
			to: "sentinel_app",
			using: sql`user_id = current_setting('app.user_id', true)`,
			withCheck: sql`user_id = current_setting('app.user_id', true)`,
		}),
	],
);
export const accountDeletions = appSchema.table(
	"account_deletions",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		requestedAt: timestamp("requested_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		purgeAfter: timestamp("purge_after", { withTimezone: true }).notNull(),
	},
	(table) => [
		index("account_deletions_purge_after_idx").on(table.purgeAfter),
		check(
			"account_deletions_purge_after_range",
			sql`${table.purgeAfter} >= ${table.requestedAt}`,
		),
		pgPolicy("account_deletions_owner_access", {
			for: "all",
			to: "sentinel_app",
			using: sql`user_id = current_setting('app.user_id', true)`,
			withCheck: sql`user_id = current_setting('app.user_id', true)`,
		}),
	],
);
