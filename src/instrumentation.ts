// Next.js runs this once when the server process starts. We use it to
// reconnect all bots that were left enabled, so they survive restarts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
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
