"use client";

import { useCallback, useEffect, useState } from "react";

export type UserLicense = {
  id: string;
  key: string;
  slots: number;
  status: "available" | "active" | "revoked" | string;
  userId: string | null;
  redeemedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function LicensePanel({ onChange }: { onChange: () => void }) {
  const [license, setLicense] = useState<UserLicense | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/licenses", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setLicense(data.license ?? null);
    } catch {
      setError("Could not load your license.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);

  async function redeem() {
    setError(null);
    setNotice(null);
    if (!key.trim()) {
      setError("Enter the license key you received from an admin.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not redeem that license.");
        return;
      }
      setLicense(data.license ?? null);
      setKey("");
      setNotice("License activated. Your bot slots are ready to use.");
      onChange();
    } catch {
      setError("Network error while redeeming the license.");
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!license?.key) return;
    try {
      await navigator.clipboard.writeText(license.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Could not copy the key. Select it and copy it manually.");
    }
  }

  const active = license?.status === "active" && license.slots > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-lg shadow-lg shadow-orange-900/30">
          🔑
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">License</h2>
          <p className="text-sm text-slate-400">
            Activate the bot slots assigned to your account.
          </p>
        </div>
      </div>

      {!loaded ? (
        <div className="glass rounded-2xl p-6 text-sm text-slate-500">Loading license…</div>
      ) : (
        <>
          <section
            className={`glass rounded-2xl p-5 ring-1 ${
              active ? "ring-emerald-500/20" : "ring-amber-500/20"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Current access
                </div>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {active
                    ? `${license.slots} bot ${license.slots === 1 ? "slot" : "slots"}`
                    : "No active license"}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  {active
                    ? "Your license is active and you can run your bots."
                    : "Redeem a license key below to unlock the Bots area."}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                  active
                    ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                    : license?.status === "revoked"
                      ? "bg-rose-500/10 text-rose-300 ring-rose-500/30"
                      : "bg-amber-500/10 text-amber-300 ring-amber-500/30"
                }`}
              >
                {active ? "Active" : license?.status === "revoked" ? "Revoked" : "Not activated"}
              </span>
            </div>

            {license && (
              <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-sm text-amber-200">
                  {license.key}
                </code>
                <button
                  onClick={copyKey}
                  className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-amber-400/40 hover:text-amber-200"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </section>

          {!active && (
            <section className="glass rounded-2xl p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Redeem a key
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Paste the key an admin gave you. Keys look like{" "}
                <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-amber-200">
                  mc-bots-akdkkakfall
                </code>
                . Each key can be used by one account at a time.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && redeem()}
                  placeholder="mc-bots-…"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/60 px-3.5 py-2.5 font-mono text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20"
                />
                <button
                  onClick={redeem}
                  disabled={busy}
                  className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Activating…" : "Activate license"}
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {error && (
        <div className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300 ring-1 ring-rose-500/20">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 ring-1 ring-emerald-500/20">
          {notice}
        </div>
      )}

      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-5 text-sm leading-relaxed text-slate-500">
        <span className="font-medium text-slate-300">Need access?</span> Ask an
        admin for a license key. Without one, you can still open the Bots page,
        but it will explain that a license is required to run bots.
      </div>
    </div>
  );
}
