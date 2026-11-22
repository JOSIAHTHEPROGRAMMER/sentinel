CREATE TABLE "app"."account_deletions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	CONSTRAINT "account_deletions_purge_after_range" CHECK ("app"."account_deletions"."purge_after" >= "app"."account_deletions"."requested_at")
);
--> statement-breakpoint
ALTER TABLE "app"."account_deletions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."account_deletions" ADD CONSTRAINT "account_deletions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_deletions_purge_after_idx" ON "app"."account_deletions" USING btree ("purge_after");--> statement-breakpoint
CREATE POLICY "account_deletions_owner_access" ON "app"."account_deletions" AS PERMISSIVE FOR ALL TO "sentinel_app" USING (user_id = current_setting('app.user_id', true)) WITH CHECK (user_id = current_setting('app.user_id', true));

--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON app.account_deletions TO sentinel_app;
--> statement-breakpoint
CREATE FUNCTION app.purge_due_account_deletions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
	purged integer;
BEGIN
	WITH due AS (
		SELECT user_id FROM app.account_deletions WHERE purge_after <= now()
	),
	deleted AS (
		DELETE FROM auth."user" AS u
		USING due
		WHERE u.id = due.user_id
		RETURNING u.id
	)
	SELECT count(*) INTO purged FROM deleted;

	RETURN purged;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.purge_due_account_deletions() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.purge_due_account_deletions() TO sentinel_worker;