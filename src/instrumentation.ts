// Next.js runs this once when the server process starts. We use it to
// run database migrations and reconnect all bots that were left enabled,
// so they survive restarts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Run Drizzle migrations so the schema is always up-to-date on startup.
    try {
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      const { drizzle } = await import("drizzle-orm/node-postgres");
      const { Pool } = await import("pg");

      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const db = drizzle(pool);

      await migrate(db, { migrationsFolder: "./drizzle/migrations" });

      await pool.end();
    } catch (err) {
      console.error("[instrumentation] Migration failed:", err);
    }

    try {
      const { resumeEnabledBots } = await import("@/lib/botManager");
      // Small delay so the DB connection is ready.
      setTimeout(() => {
        void resumeEnabledBots();
      }, 1500);
    } catch {
      // ignore
    }
  }
}
