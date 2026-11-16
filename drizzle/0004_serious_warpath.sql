CREATE TABLE "app"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."monitors" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_id_owner_id_idx" ON "app"."projects" USING btree ("id","owner_id");--> statement-breakpoint
CREATE INDEX "projects_owner_id_idx" ON "app"."projects" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "app"."monitors" ADD CONSTRAINT "monitors_project_owner_fk" FOREIGN KEY ("project_id","owner_id") REFERENCES "app"."projects"("id","owner_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitors_project_id_idx" ON "app"."monitors" USING btree ("project_id");--> statement-breakpoint
CREATE POLICY "projects_owner_access" ON "app"."projects" AS PERMISSIVE FOR ALL TO "sentinel_app" USING (owner_id = current_setting('app.user_id', true)) WITH CHECK (owner_id = current_setting('app.user_id', true));--> statement-breakpoint
