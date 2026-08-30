"use client";

import { useCallback, useEffect, useState } from "react";

type AdminLicense = {
  id: string;
  key: string;
  slots: number;
  status: "available" | "active" | "revoked" | string;
  userId: string | null;
  assignedUsername: string | null;
  redeemedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function AdminLicenseManager() {
  const [licenses, setLicenses] = useState<AdminLicense[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [slots, setSlots] = useState("1");
  const [customKey, setCustomKey] = useState("");
  const [slotDrafts, setSlotDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/licenses", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const next = (data.licenses ?? []) as AdminLicense[];
      setLicenses(next);
      setSlotDrafts(
        Object.fromEntries(next.map((license) => [license.id, String(license.slots)])),
      );
    } catch {
      setError("Could not load licenses.");
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

  async function createLicense() {
    setError(null);
    setCreatedKey(null);
    setBusy("create");
    try {
      const body: { slots: string; key?: string } = { slots };
      if (customKey.trim()) body.key = customKey.trim();
      const res = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create license.");
        return;
      }
      setCreatedKey(data.license?.key ?? null);
      setCustomKey("");
      await refresh();
    } catch {
      setError("Network error while creating the license.");
    } finally {
      setBusy(null);
    }
  }

  async function updateLicense(
    id: string,
    payload: { slots?: number; status?: string },
  ) {
    setError(null);
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/licenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not update license.");
        return;
      }
      await refresh();
    } catch {
      setError("Network error while updating the license.");
    } finally {
      setBusy(null);
    }
  }

  async function removeLicense(license: AdminLicense) {
    const warning = license.assignedUsername
      ? `Delete ${license.key} assigned to ${license.assignedUsername}? Their bots will be stopped.`
      : `Delete ${license.key}? This cannot be undone.`;
    if (!confirm(warning)) return;
    setError(null);
    setBusy(license.id);
    try {
      const res = await fetch(`/api/admin/licenses/${license.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not delete license.");
        return;
      }
      await refresh();
    } catch {
      setError("Network error while deleting the license.");
    } finally {
      setBusy(null);
    }
  }

  async function copyCreatedKey() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Could not copy the generated key.");
    }
  }

  const activeCount = licenses.filter((license) => license.status === "active").length;
  const availableCount = licenses.filter(
    (license) => license.status === "available",
  ).length;

  return (
    <section className="mt-10 border-t border-slate-800/80 pt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-lg shadow-lg shadow-orange-900/30">
            🔑
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Licenses</h3>
            <p className="text-sm text-slate-400">
              Create, revoke, release, and manage bot access keys.
            </p>
          </div>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-300 ring-1 ring-emerald-500/20">
            {activeCount} active
          </span>
          <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-sky-300 ring-1 ring-sky-500/20">
            {availableCount} available
          </span>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">
              Bot slots
            </span>
            <input
              value={slots}
              onChange={(event) => setSlots(event.target.value)}
              inputMode="numeric"
              min={1}
              max={1000}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">
              Custom key <span className="text-slate-500">(optional)</span>
            </span>
            <input
              value={customKey}
              onChange={(event) => setCustomKey(event.target.value)}
              placeholder="Leave blank to generate mc-bots-…"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
          <button
            onClick={createLicense}
            disabled={busy !== null}
            className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "create" ? "Creating…" : "＋ Create license"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Generated keys use the format <code className="text-amber-200">mc-bots-xxxxxxxxxxxxxxxx</code>.
          Give a key to one user; they redeem it from the License button in the sidebar.
        </p>
      </div>

      {createdKey && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-500/10 px-4 py-3 ring-1 ring-emerald-500/20">
          <span className="text-xs font-medium text-emerald-300">New key:</span>
          <code className="min-w-0 flex-1 break-all font-mono text-sm text-emerald-100">
            {createdKey}
          </code>
          <button
            onClick={copyCreatedKey}
            className="rounded-lg border border-emerald-400/30 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-400/10"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300 ring-1 ring-rose-500/20">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {!loaded ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading licenses…</p>
        ) : licenses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/30 px-5 py-10 text-center text-sm text-slate-500">
            No licenses created yet.
          </div>
        ) : (
          licenses.map((license) => {
            const isBusy = busy === license.id;
            const active = license.status === "active";
            return (
              <div
                key={license.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="break-all font-mono text-sm text-amber-200">
                        {license.key}
                      </code>
                      <StatusPill status={license.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {license.assignedUsername
                        ? `Assigned to ${license.assignedUsername}`
                        : "Not assigned — ready to redeem"}
                      {license.redeemedAt
                        ? ` · redeemed ${formatDate(license.redeemedAt)}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 p-1">
                      <label className="pl-2 text-[10px] uppercase tracking-wide text-slate-500">
                        slots
                      </label>
                      <input
                        value={slotDrafts[license.id] ?? String(license.slots)}
                        onChange={(event) =>
                          setSlotDrafts((current) => ({
                            ...current,
                            [license.id]: event.target.value,
                          }))
                        }
                        inputMode="numeric"
                        className="w-14 rounded bg-slate-950/60 px-2 py-1 text-center text-xs text-slate-200 outline-none focus:ring-1 focus:ring-amber-400/50"
                      />
                      <button
                        disabled={busy !== null}
                        onClick={() =>
                          updateLicense(license.id, {
                            slots: Number(slotDrafts[license.id]),
                          })
                        }
                        className="rounded bg-slate-700 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-600 disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>

                    {active ? (
                      <button
                        disabled={busy !== null}
                        onClick={() => updateLicense(license.id, { status: "revoked" })}
                        className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                      >
                        Revoke
                      </button>
                    ) : license.status === "revoked" ? (
                      <button
                        disabled={busy !== null}
                        onClick={() => updateLicense(license.id, { status: "available" })}
                        className="rounded-lg border border-sky-500/30 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/10 disabled:opacity-40"
                      >
                        Release key
                      </button>
                    ) : null}
                    <button
                      disabled={busy !== null}
                      onClick={() => removeLicense(license)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-40"
                    >
                      {isBusy ? "Working…" : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const classes =
    status === "active"
      ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
      : status === "revoked"
        ? "bg-rose-500/10 text-rose-300 ring-rose-500/20"
        : "bg-sky-500/10 text-sky-300 ring-sky-500/20";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ring-1 ${classes}`}>
      {status}
    </span>
  );
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

const inputClass =
  "w-full rounded-xl border border-slate-700/80 bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20";
