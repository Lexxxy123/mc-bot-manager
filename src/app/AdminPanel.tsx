"use client";

import { useCallback, useEffect, useState } from "react";

type AdminUser = {
  id: string;
  username: string;
  avatar: string | null;
  role: string;
  botSlots: number;
  botCount: number;
  botsOnline: number;
  isGuest: boolean;
  discordId: string | null;
  createdAt: string;
};

type AdminBot = {
  id: string;
  name: string;
  username: string | null;
  host: string;
  port: number;
  status: string;
};

export default function AdminPanel({ meId }: { meId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bots, setBots] = useState<AdminBot[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users ?? []);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function loadBots(userId: string) {
    if (expanded === userId) {
      setExpanded(null);
      setBots([]);
      return;
    }
    setExpanded(userId);
    setBots([]);
    const res = await fetch(`/api/admin/users/${userId}/bots`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      setBots(data.bots ?? []);
    }
  }

  async function setSlots(userId: string, botSlots: number) {
    if (botSlots < 0) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botSlots }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleRole(u: AdminUser) {
    setBusy(true);
    try {
      await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: u.role === "admin" ? "user" : "admin" }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeBot(botId: string, userId: string) {
    if (!confirm("Remove this bot?")) return;
    setBusy(true);
    try {
      await fetch(`/api/bots/${botId}`, { method: "DELETE" });
      const res = await fetch(`/api/admin/users/${userId}/bots`, {
        cache: "no-store",
      });
      if (res.ok) setBots((await res.json()).bots ?? []);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(u: AdminUser) {
    if (
      !confirm(
        `Delete user "${u.username}" and ALL their bots? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    try {
      await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const totalUsers = users.length;
  const totalBots = users.reduce((a, u) => a + u.botCount, 0);
  const totalOnline = users.reduce((a, u) => a + u.botsOnline, 0);

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-700 text-xl shadow-lg shadow-purple-900/40">
          🛡️
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Admin Panel</h2>
          <p className="text-sm text-slate-400">
            Manage users, bot slots, and running bots.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatCard label="Users" value={totalUsers} accent="text-sky-300" />
        <StatCard label="Total bots" value={totalBots} accent="text-slate-200" />
        <StatCard
          label="Bots online"
          value={totalOnline}
          accent="text-emerald-300"
        />
      </div>

      <div className="mt-6 space-y-3">
        {!loaded ? (
          <p className="py-10 text-center text-slate-500">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="py-10 text-center text-slate-500">No users yet.</p>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {u.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.avatar}
                      alt=""
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-700 text-sm font-bold">
                      {u.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{u.username}</span>
                      {u.role === "admin" && (
                        <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-xs font-medium text-fuchsia-300 ring-1 ring-fuchsia-500/30">
                          admin
                        </span>
                      )}
                      {u.isGuest && (
                        <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-xs text-slate-400 ring-1 ring-slate-600/40">
                          guest
                        </span>
                      )}
                      {u.id === meId && (
                        <span className="text-xs text-slate-500">(you)</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      <span className="text-emerald-300">
                        {u.botsOnline} online
                      </span>{" "}
                      · {u.botCount}/{u.botSlots} bots
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 p-1">
                    <button
                      disabled={busy || u.botSlots <= 0}
                      onClick={() => setSlots(u.id, u.botSlots - 1)}
                      className="grid h-6 w-6 place-items-center rounded text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="min-w-[3.5rem] text-center text-xs text-slate-300">
                      {u.botSlots} slots
                    </span>
                    <button
                      disabled={busy}
                      onClick={() => setSlots(u.id, u.botSlots + 1)}
                      className="grid h-6 w-6 place-items-center rounded text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={() => loadBots(u.id)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                  >
                    {expanded === u.id ? "Hide bots" : "View bots"}
                  </button>

                  {u.id !== meId && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => toggleRole(u)}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                      >
                        {u.role === "admin" ? "Demote" : "Make admin"}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => deleteUser(u)}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {expanded === u.id && (
                <div className="mt-3 border-t border-slate-800 pt-3">
                  {bots.length === 0 ? (
                    <p className="text-xs text-slate-500">No bots.</p>
                  ) : (
                    <ul className="space-y-2">
                      {bots.map((b) => (
                        <li
                          key={b.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/40 px-3 py-2 text-xs"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                b.status === "online"
                                  ? "bg-emerald-400"
                                  : b.status === "connecting"
                                    ? "bg-amber-400"
                                    : b.status === "error"
                                      ? "bg-rose-500"
                                      : "bg-slate-500"
                              }`}
                            />
                            <span className="font-medium text-slate-200">
                              {b.name}
                            </span>
                            <span className="text-slate-500">
                              {b.host}:{b.port}
                            </span>
                            {b.username && (
                              <span className="text-slate-500">
                                · {b.username}
                              </span>
                            )}
                          </span>
                          <button
                            disabled={busy}
                            onClick={() => removeBot(b.id, u.id)}
                            className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-40"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className={`text-2xl font-semibold ${accent}`}>{value}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </div>
  );
}
