// Determine the public-facing origin of the app, preferring an explicit
// PUBLIC_BASE_URL, then proxy-forwarded headers, then the request origin.
export function publicOrigin(req: Request): string {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  const h = req.headers;
  const forwardedHost = h.get("x-forwarded-host") || h.get("host");
  if (forwardedHost) {
    // Anything that isn't localhost must use https (Discord requires it and
    // the sandbox is served over https even if the proxy header says http).
    const isLocal =
      forwardedHost.startsWith("localhost") ||
      forwardedHost.startsWith("127.0.0.1") ||
      forwardedHost.startsWith("0.0.0.0");
    const proto = isLocal
      ? h.get("x-forwarded-proto") || "http"
      : "https";
    return `${proto}://${forwardedHost}`;
  }
  return new URL(req.url).origin;
}
