CREATE TABLE IF NOT EXISTS "licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"slots" integer DEFAULT 1 NOT NULL,
	"user_id" uuid,
	"status" text DEFAULT 'available' NOT NULL,
	"redeemed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "licenses_key_unique" ON "licenses" USING btree ("key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "licenses_active_user_unique" ON "licenses" USING btree ("user_id") WHERE "status" = 'active';
