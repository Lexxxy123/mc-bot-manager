CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_id" text,
	"username" text NOT NULL,
	"avatar" text,
	"role" text DEFAULT 'user' NOT NULL,
	"bot_slots" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "bots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"username" text,
	"uuid" text,
	"host" text NOT NULL,
	"port" integer DEFAULT 25565 NOT NULL,
	"version" text DEFAULT 'auto' NOT NULL,
	"proxy" text DEFAULT '' NOT NULL,
	"yt_channel" text DEFAULT 'Alight.z' NOT NULL,
	"beam_ip" text DEFAULT 'badlion-pvp.xyz' NOT NULL,
	"status" text DEFAULT 'offline' NOT NULL,
	"last_error" text,
	"enabled" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "beam_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" uuid,
	"target" text,
	"outcome" text DEFAULT 'unknown' NOT NULL,
	"transcript" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
