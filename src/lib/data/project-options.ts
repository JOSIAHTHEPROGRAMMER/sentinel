import "server-only";

import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema/app";

// Just what a filter dropdown needs, without the health aggregates
export async function getProjectOptions(userId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);

    return tx
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .orderBy(asc(projects.name));
  });
}
