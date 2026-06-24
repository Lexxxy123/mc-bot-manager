"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BotStatus = "offline" | "connecting" | "online" | "error";

type BotItem = {
  id: string;
  name: string;
  username: string | null;
  host: string;
  port: number;
  version: string;
  proxy: string;
  ytChannel: string;
  beamIp: string;
  status: BotStatus;
  joined: boolean;
  lastError: string | null;
  createdAt: string;
};

type LogEntry = {
  ts: number;
  level: "info" | "chat" | "error" | "system";
  line: string;
};

const STATUS_META: Record<
  BotStatus,
  { label: string; dot: string; text: string; ring: string }
> = {
  online: {
    label: "Joined",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    ring: "ring-emerald-500/30 bg-emerald-500/10",
  },
  connecting: {
    label: "Connecting",
    dot: "bg-amber-400 animate-pulse",
    text: "text-amber-300",
    ring: "ring-amber-500/30 bg-amber-500/10",
  },
  error: {
    label: "Failed",
    dot: "bg-rose-500",
    text: "text-rose-300",
    ring: "ring-rose-500/30 bg-rose-500/10",
  },
  offline: {
    label: "Stopped",
    dot: "bg-slate-500",
    text: "text-slate-400",
    ring: "ring-slate-600/40 bg-slate-700/20",
  },
};

const VERSIONS = [
  "1.21.11",
  "1.21.9",
  "1.21.8",
  "1.21.6",
  "1.21.5",
  "1.21.4",
  "1.21.3",
  "1.21.1",
  "1.21",
  "1.20.6",
  "1.20.4",
  "1.20.2",
  "1.20.1",
  "1.19.4",
  "1.19.2",
  "1.18.2",
  "1.17.1",
  "1.16.5",
  "1.12.2",
  "1.8.9",
];

export default function BotDashboard() {
  const [tab, setTab] = useState<"bots" | "about">("bots");
  const [items, setItems] = useState<BotItem[]>([]);
  const [slots, setSlots] = useState<number>(0);
  const [showAdd, setShowAdd] = useState(false);
  const [consoleId, setConsoleId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/bots", { cache: "no-store" });
      const data = await res.json();
      setItems(data.bots ?? []);
      if (typeof data.slots === "number") setSlots(data.slots);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  const slotsFull = slots > 0 && items.length >= slots;

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [refresh]);

  const consoleBot = items.find((b) => b.id === consoleId) ?? null;
  const editBot = items.find((b) => b.id === editId) ?? null;
  const viewBot = items.find((b) => b.id === viewId) ?? null;

  return (
    <div>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">My Bots</h2>
          <p className="text-sm text-slate-400">
            {slots > 0 ? (
              <>
                Using{" "}
                <span
                  className={
                    slotsFull ? "font-semibold text-amber-300" : "text-slate-200"
                  }
                >
                  {items.length}/{slots}
                </span>{" "}
                bot slots
              </>
            ) : (
              "Spin up Minecraft bots and control them."
            )}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          disabled={slotsFull}
          title={slotsFull ? "No bot slots left — ask an admin" : "Add a bot"}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="text-lg leading-none">＋</span> Add bot
        </button>
      </header>

      <nav className="mt-6 flex gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1 text-sm">
        {(["bots", "about"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-2 font-medium capitalize transition ${
              tab === t
                ? "bg-slate-800 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t === "bots" ? `Bots (${items.length})` : "How it works"}
          </button>
        ))}
      </nav>

      {tab === "bots" ? (
        <section className="mt-6">
          {!loaded ? (
            <p className="py-16 text-center text-slate-500">Loading…</p>
          ) : items.length === 0 ? (
            <EmptyState onAdd={() => setShowAdd(true)} />
          ) : (
            <ul className="grid gap-4">
              {items.map((bot) => (
                <BotCard
                  key={bot.id}
                  bot={bot}
                  onChanged={refresh}
                  onConsole={() => setConsoleId(bot.id)}
                  onEdit={() => setEditId(bot.id)}
                  onView={() => setViewId(bot.id)}
                />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <AboutPanel />
      )}

      {showAdd && (
        <AddBotModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}

      {consoleBot && (
        <ConsoleModal bot={consoleBot} onClose={() => setConsoleId(null)} />
      )}

      {editBot && (
        <EditBotModal
          bot={editBot}
          onClose={() => setEditId(null)}
          onSaved={() => {
            setEditId(null);
            refresh();
          }}
        />
      )}

      {viewBot && (
        <ViewModal bot={viewBot} onClose={() => setViewId(null)} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: BotStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${meta.ring} ${meta.text}`}
    >
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function BotCard({
  bot,
  onChanged,
  onConsole,
  onEdit,
  onView,
}: {
  bot: BotItem;
  onChanged: () => void;
  onConsole: () => void;
  onEdit: () => void;
  onView: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const running = bot.status === "online" || bot.status === "connecting";

  async function act(path: string, method = "POST") {
    setBusy(true);
    try {
      await fetch(path, { method });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="card-hover glass rounded-2xl p-4 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg ring-1 ${
              bot.status === "online"
                ? "bg-emerald-500/15 ring-emerald-500/30"
                : bot.status === "connecting"
                  ? "bg-amber-500/15 ring-amber-500/30"
                  : bot.status === "error"
                    ? "bg-rose-500/15 ring-rose-500/30"
                    : "bg-slate-700/30 ring-slate-600/40"
            }`}
          >
            🤖
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold">{bot.name}</h3>
              <StatusBadge status={bot.status} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 truncate text-sm text-slate-400">
              <span className="font-mono text-slate-300">
                {bot.host}:{bot.port}
              </span>
              <span className="text-slate-600">·</span>
              <span className="rounded-md bg-slate-800/60 px-1.5 py-0.5 text-xs text-slate-400">
                {bot.version && bot.version !== "auto" ? bot.version : "auto"}
              </span>
              {bot.username && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400">{bot.username}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            onClick={onView}
            disabled={bot.status !== "online"}
            title={
              bot.status === "online"
                ? "Open the live bot view"
                : "Bot must be online to view"
            }
            className="rounded-lg border border-sky-700/60 bg-sky-600/20 px-3 py-1.5 text-sm font-medium text-sky-200 transition hover:bg-sky-600/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            👁 View as bot
          </button>
          <button
            onClick={onConsole}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
          >
            Console
          </button>
          <button
            onClick={onEdit}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
            title="Manage token & version"
          >
            ⚙ Manage
          </button>
          {running ? (
            <button
              disabled={busy}
              onClick={() => act(`/api/bots/${bot.id}/stop`)}
              className="rounded-lg bg-amber-500/90 px-3 py-1.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              Stop
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => act(`/api/bots/${bot.id}/start`)}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              Start
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => {
              if (confirm(`Delete bot "${bot.name}"?`))
                act(`/api/bots/${bot.id}`, "DELETE");
            }}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300"
            title="Delete bot"
          >
            ✕
          </button>
        </div>
      </div>

      {bot.status === "error" && bot.lastError && (
        <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-rose-500/20">
          {bot.lastError}
        </p>
      )}
      {bot.joined && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-300">
          <span>✅</span> Successfully joined the server.
        </p>
      )}
    </li>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="grid animate-fade-in place-items-center rounded-3xl border border-dashed border-slate-700/60 bg-slate-900/30 px-6 py-20 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-indigo-500/20 text-4xl ring-1 ring-slate-700/50">
        🛰️
      </div>
      <h3 className="mt-5 text-lg font-semibold">No bots yet</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-400">
        Add a bot with your Minecraft token and a server address. It&apos;ll try
        to join and report back here in real-time.
      </p>
      <button
        onClick={onAdd}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400 active:scale-[.98]"
      >
        <span className="text-lg leading-none">＋</span> Add your first bot
      </button>
    </div>
  );
}

function AddBotModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("25565");
  const [version, setVersion] = useState("auto");
  const [proxy, setProxy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (!token.trim()) return setError("Please paste your Minecraft token.");
    if (!host.trim()) return setError("Please enter the server IP / address.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, token, host, port, version, proxy }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create bot");
        return;
      }
      onCreated();
    } catch {
      setError("Network error while creating bot");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 text-lg shadow-lg shadow-emerald-900/40">
              ＋
            </div>
            <div>
              <h2 className="text-lg font-semibold">Add a bot</h2>
              <p className="text-xs text-slate-400">
                Connect a Minecraft account to a server
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <Field label="Bot name (optional)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My farming bot"
              className={inputClass}
            />
          </Field>

          <Field
            label="Minecraft token"
            hint="Your minecraft.net / Yggdrasil / bearer (access) token. Used to authenticate the session."
          >
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJraWQiOiJ..."
              rows={3}
              className={`${inputClass} resize-none font-mono text-xs`}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Server IP / address">
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="play.example.net"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Port">
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="25565"
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
          </div>

          <Field
            label="Minecraft version"
            hint="Leave on Auto-detect first. If you get a 'socketClosed' disconnect, pick the server's exact version here — that fixes most join failures on proxy/anticheat networks."
          >
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className={inputClass}
            >
              <option value="auto">Auto-detect</option>
              {VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="SOCKS proxy (optional)"
            hint="Route the connection through a SOCKS5/4 proxy, e.g. socks5://user:pass@1.2.3.4:1080. Leave blank for a direct connection. Note: a proxy only changes your IP — it does NOT prevent anticheat bans (those are account-based)."
          >
            <input
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
              placeholder="socks5://user:pass@host:1080"
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>

          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/20">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create & connect"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function ConsoleModal({ bot, onClose }: { bot: BotItem; onClose: () => void }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<BotStatus>(bot.status);
  const [msg, setMsg] = useState("");
  const [beam, setBeam] = useState<{ looping: boolean; stage: string }>({
    looping: false,
    stage: "",
  });
  const [acting, setActing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/bots/${bot.id}/console`, {
        cache: "no-store",
      });
      const data = await res.json();
      setLogs(data.logs ?? []);
      setStatus(data.status ?? "offline");
      setBeam(data.beam ?? { looping: false, stage: "" });
    } catch {
      /* ignore */
    }
  }, [bot.id]);

  async function toggleBeam() {
    setActing(true);
    try {
      await fetch(`/api/bots/${bot.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: beam.looping ? "beam_stop" : "beam_start",
        }),
      });
      await poll();
    } finally {
      setActing(false);
    }
  }

  useEffect(() => {
    poll();
    const t = setInterval(poll, 1500);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [logs]);

  async function send() {
    const m = msg.trim();
    if (!m) return;
    setMsg("");
    await fetch(`/api/bots/${bot.id}/console`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: m }),
    });
    poll();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">{bot.name}</h2>
            <StatusBadge status={status} />
            {beam.looping && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-xs font-medium text-fuchsia-300 ring-1 ring-fuchsia-500/30">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
                beam: {beam.stage || "running"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {beam.looping ? (
              <button
                onClick={toggleBeam}
                disabled={acting}
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-rose-950 transition hover:bg-rose-400 disabled:opacity-40"
              >
                ⏹ Stop Beam
              </button>
            ) : (
              <button
                onClick={toggleBeam}
                disabled={acting || status !== "online"}
                title="Start the beam loop from the console"
                className="rounded-lg bg-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-fuchsia-950 transition hover:bg-fuchsia-400 disabled:opacity-40"
              >
                📡 Beam
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
          className="flex-1 overflow-y-auto bg-slate-950/70 p-4 font-mono text-xs leading-relaxed"
        >
          {logs.length === 0 ? (
            <p className="text-slate-600">No output yet…</p>
          ) : (
            logs.map((l, i) => {
              const w = whisperKind(l.line);
              return (
                <div key={i} className="whitespace-pre-wrap break-words">
                  <span className="text-slate-600">
                    {new Date(l.ts).toLocaleTimeString()}{" "}
                  </span>
                  {w === "from" ? (
                    <span className="rounded bg-cyan-500/15 px-1 font-semibold text-cyan-300 ring-1 ring-cyan-500/30">
                      {l.line}
                    </span>
                  ) : w === "to" ? (
                    <span className="rounded bg-fuchsia-500/15 px-1 font-semibold text-fuchsia-300 ring-1 ring-fuchsia-500/30">
                      {l.line}
                    </span>
                  ) : (
                    <span className={logColor(l.level)}>{l.line}</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-800 p-3">
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={
              status === "online"
                ? "Type a chat message or command…"
                : "Bot must be online to chat"
            }
            disabled={status !== "online"}
            className={`${inputClass} flex-1 font-mono text-xs disabled:opacity-50`}
          />
          <button
            onClick={send}
            disabled={status !== "online"}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function EditBotModal({
  bot,
  onClose,
  onSaved,
}: {
  bot: BotItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [token, setToken] = useState("");
  const [version, setVersion] = useState(bot.version || "auto");
  const [host, setHost] = useState(bot.host);
  const [port, setPort] = useState(String(bot.port));
  const [proxy, setProxy] = useState(bot.proxy || "");
  const [ytChannel, setYtChannel] = useState(bot.ytChannel || "Alight.z");
  const [beamIp, setBeamIp] = useState(bot.beamIp || "badlion-pvp.xyz");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    const payload: {
      token?: string;
      version?: string;
      host?: string;
      port?: string;
      proxy?: string;
      ytChannel?: string;
      beamIp?: string;
    } = {};
    if (token.trim()) payload.token = token.trim();
    if (version !== bot.version) payload.version = version;
    if (host.trim() && host.trim() !== bot.host) payload.host = host.trim();
    if (port.trim() && Number(port) !== bot.port) payload.port = port.trim();
    if (proxy.trim() !== (bot.proxy || "")) payload.proxy = proxy.trim();
    if (ytChannel.trim() && ytChannel.trim() !== (bot.ytChannel || ""))
      payload.ytChannel = ytChannel.trim();
    if (beamIp.trim() && beamIp.trim() !== (bot.beamIp || ""))
      payload.beamIp = beamIp.trim();
    if (
      !payload.token &&
      !payload.version &&
      !payload.host &&
      !payload.port &&
      payload.proxy === undefined &&
      !payload.ytChannel &&
      !payload.beamIp
    ) {
      setError("Change a field to save.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update bot");
        return;
      }
      onSaved();
    } catch {
      setError("Network error while updating bot");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="glass max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-lg ring-1 ring-slate-600/50">
              ⚙
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{bot.name}</h2>
              <p className="truncate text-xs text-slate-400">
                {bot.host}:{bot.port}
                {bot.username ? ` · ${bot.username}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <Field
            label="New Minecraft token"
            hint="Paste a fresh minecraft.net / bearer (access) token. Leave blank to keep the current one."
          >
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJraWQiOiJ... (leave blank to keep current)"
              rows={3}
              className={`${inputClass} resize-none font-mono text-xs`}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Server IP / address">
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="play.example.net"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Port">
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="25565"
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
          </div>

          <Field
            label="Minecraft version"
            hint="If a join fails with 'socketClosed', set the server's exact version here."
          >
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className={inputClass}
            >
              <option value="auto">Auto-detect</option>
              {VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="SOCKS proxy (optional)"
            hint="e.g. socks5://user:pass@1.2.3.4:1080. Clear it for a direct connection. A proxy changes your IP only — it does not stop anticheat bans."
          >
            <input
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
              placeholder="socks5://user:pass@host:1080"
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>

          <Field
            label="YouTube channel (for Beam AI)"
            hint="The channel name the beam AI mentions when a player asks 'what's your channel'."
          >
            <input
              value={ytChannel}
              onChange={(e) => setYtChannel(e.target.value)}
              placeholder="Alight.z"
              className={inputClass}
            />
          </Field>

          <Field
            label="Server IP (Beam fallback)"
            hint="If a player can't use Discord, the beam AI shares this IP so they can still join."
          >
            <input
              value={beamIp}
              onChange={(e) => setBeamIp(e.target.value)}
              placeholder="badlion-pvp.xyz"
              className={inputClass}
            />
          </Field>

          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/20">
              {error}
            </p>
          )}

          <p className="rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-300 ring-1 ring-sky-500/20">
            If the bot is running, it will automatically restart with the new
            settings.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

type ViewEntity = {
  name: string;
  type: string;
  kind: "player" | "mob" | "object" | "other";
  forward: number;
  right: number;
  dy: number;
  distance: number;
  bearing: number;
};

type HotbarItem = {
  slot: number;
  name: string | null;
  displayName: string | null;
  count: number;
  selected: boolean;
};

type ViewSnapshot = {
  available: boolean;
  username?: string;
  position?: { x: number; y: number; z: number };
  yaw?: number;
  pitch?: number;
  facing?: string;
  health?: number;
  food?: number;
  dimension?: string;
  timeOfDay?: number;
  isDay?: boolean;
  heldItem?: string | null;
  lookingAt?: { name: string; x: number; y: number; z: number } | null;
  entities?: ViewEntity[];
  nearbyBlocks?: { name: string; forward: number; right: number; dy: number }[];
  hotbar?: HotbarItem[];
  selectedSlot?: number;
  using?: boolean;
};

const ITEM_IMG_VERSION = "1.21.4";

function itemImageUrl(name: string, dir: "item" | "block"): string {
  return `https://assets.mcasset.cloud/${ITEM_IMG_VERSION}/assets/minecraft/textures/${dir}/${name}.png`;
}

function ItemIcon({ name }: { name: string }) {
  // Try the item texture first, then fall back to the block texture, then emoji.
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  if (stage === 2) {
    return <span className="text-lg">📦</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={itemImageUrl(name, stage === 0 ? "item" : "block")}
      alt={name}
      width={32}
      height={32}
      loading="lazy"
      onError={() => setStage((s) => (s === 0 ? 1 : 2))}
      style={{ imageRendering: "pixelated" }}
      className="h-8 w-8 object-contain"
    />
  );
}

function ViewModal({ bot, onClose }: { bot: BotItem; onClose: () => void }) {
  const [snap, setSnap] = useState<ViewSnapshot | null>(null);
  const [status, setStatus] = useState<BotStatus>(bot.status);
  const radar = useRef<HTMLCanvasElement>(null);

  const [beam, setBeam] = useState<{
    beaming: boolean;
    looping: boolean;
    stage: string;
  }>({
    beaming: false,
    looping: false,
    stage: "",
  });

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/bots/${bot.id}/view`, {
        cache: "no-store",
      });
      const data = await res.json();
      setStatus(data.status ?? "offline");
      setSnap(data.snapshot ?? { available: false });
      setBeam(data.beam ?? { beaming: false, looping: false, stage: "" });
    } catch {
      /* ignore */
    }
  }, [bot.id]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 700);
    return () => clearInterval(t);
  }, [poll]);

  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const doAction = useCallback(
    async (action: string, slot?: number) => {
      setActing(true);
      setActionMsg(null);
      try {
        const res = await fetch(`/api/bots/${bot.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, slot }),
        });
        const data = await res.json();
        if (!res.ok) setActionMsg(data.error ?? "Action failed");
        else if (data.message) setActionMsg(data.message);
        await poll();
      } catch {
        setActionMsg("Network error");
      } finally {
        setActing(false);
      }
    },
    [bot.id, poll],
  );

  // Keyboard shortcuts: 1-9 select slot, R = use/right-click.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (status !== "online") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key >= "1" && e.key <= "9") {
        doAction("select", Number(e.key) - 1);
      } else if (e.key.toLowerCase() === "r") {
        doAction("use");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doAction, status]);

  // Draw the first-person radar / minimap.
  useEffect(() => {
    const canvas = radar.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const RANGE = 32; // blocks shown from center to edge
    const scale = Math.min(W, H) / 2 / RANGE;

    ctx.clearRect(0, 0, W, H);
    // background
    const sky = snap?.isDay ? "#0b1220" : "#05070d";
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // range rings
    ctx.strokeStyle = "rgba(148,163,184,0.18)";
    ctx.lineWidth = 1;
    for (let r = 8; r <= RANGE; r += 8) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // field-of-view cone (bot looks "up" on the radar)
    ctx.fillStyle = "rgba(56,189,248,0.10)";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const fov = (70 * Math.PI) / 180;
    ctx.arc(cx, cy, RANGE * scale, -Math.PI / 2 - fov / 2, -Math.PI / 2 + fov / 2);
    ctx.closePath();
    ctx.fill();

    // nearby blocks (ground)
    if (snap?.nearbyBlocks) {
      ctx.fillStyle = "rgba(71,85,105,0.55)";
      for (const b of snap.nearbyBlocks) {
        // forward => up (-y on canvas), right => +x
        const px = cx + b.right * scale;
        const py = cy - b.forward * scale;
        ctx.fillRect(px - 2, py - 2, 4, 4);
      }
    }

    // entities
    if (snap?.entities) {
      for (const e of snap.entities) {
        const px = cx + e.right * scale;
        const py = cy - e.forward * scale;
        if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue;
        let color = "#94a3b8";
        if (e.kind === "player") color = "#34d399";
        else if (e.kind === "mob") color = "#f87171";
        else if (e.kind === "object") color = "#fbbf24";
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, e.kind === "player" ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
        if (e.kind === "player") {
          ctx.fillStyle = "#a7f3d0";
          ctx.font = "10px ui-monospace, monospace";
          ctx.fillText(e.name.slice(0, 12), px + 7, py + 3);
        }
      }
    }

    // bot in center, facing up
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx - 5, cy + 6);
    ctx.lineTo(cx + 5, cy + 6);
    ctx.closePath();
    ctx.fill();
  }, [snap]);

  const offline = status !== "online" || !snap?.available;

  return (
    <Overlay onClose={onClose}>
      <div className="glass flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">👁 {bot.name} — bot view</h2>
            <StatusBadge status={status} />
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {offline ? (
          <div className="grid place-items-center px-6 py-20 text-center text-slate-500">
            <div className="text-4xl">🛰️</div>
            <p className="mt-3 max-w-sm text-sm">
              The bot must be online and spawned in the world to stream its
              view. Start the bot and wait until it joins.
            </p>
          </div>
        ) : (
          <div className="flex flex-col overflow-y-auto">
          <div className="grid gap-4 p-5 sm:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2">
              <canvas
                ref={radar}
                width={340}
                height={340}
                className="rounded-xl border border-slate-800 bg-slate-950"
              />
              <p className="text-xs text-slate-500">
                Top-down radar · bot faces ▲ · 32-block range
              </p>
              <div className="flex flex-wrap justify-center gap-3 text-xs">
                <Legend color="#38bdf8" label="you" />
                <Legend color="#34d399" label="players" />
                <Legend color="#f87171" label="mobs" />
                <Legend color="#fbbf24" label="items" />
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Position">
                  {snap?.position
                    ? `${snap.position.x}, ${snap.position.y}, ${snap.position.z}`
                    : "—"}
                </Stat>
                <Stat label="Facing">
                  {snap?.facing ?? "—"}
                  {typeof snap?.yaw === "number"
                    ? ` (${Math.round((snap.yaw * 180) / Math.PI)}°)`
                    : ""}
                </Stat>
                <Stat label="Health">
                  ❤️ {snap?.health ?? "—"} / 20
                </Stat>
                <Stat label="Food">🍗 {snap?.food ?? "—"} / 20</Stat>
                <Stat label="Dimension">{snap?.dimension ?? "—"}</Stat>
                <Stat label="Time">
                  {snap?.isDay ? "☀️ day" : "🌙 night"}
                </Stat>
                <Stat label="Held item">{snap?.heldItem ?? "empty hand"}</Stat>
                <Stat label="Looking at">
                  {snap?.lookingAt
                    ? `${snap.lookingAt.name}`
                    : "nothing (air)"}
                </Stat>
              </div>

              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nearby entities ({snap?.entities?.length ?? 0})
                </h3>
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                  {snap?.entities && snap.entities.length > 0 ? (
                    snap.entities.map((e, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                              background:
                                e.kind === "player"
                                  ? "#34d399"
                                  : e.kind === "mob"
                                    ? "#f87171"
                                    : e.kind === "object"
                                      ? "#fbbf24"
                                      : "#94a3b8",
                            }}
                          />
                          <span className="truncate">{e.name}</span>
                          <span className="text-slate-600">({e.type})</span>
                        </span>
                        <span className="shrink-0 font-mono text-slate-400">
                          {e.distance}m{" "}
                          {e.forward >= 0 ? "front" : "behind"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-600">
                      No entities within 64 blocks.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Hotbar: click a slot to select it, then use/eat/drop */}
          <div className="border-t border-slate-800 bg-slate-950/60 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Hotbar — click a slot to hold it
              </h3>
              {actionMsg && (
                <span className="text-xs text-sky-300">{actionMsg}</span>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              {(snap?.hotbar ?? []).map((it) => (
                <button
                  key={it.slot}
                  onClick={() => doAction("select", it.slot)}
                  disabled={acting}
                  title={
                    it.displayName
                      ? `${it.displayName} ×${it.count}`
                      : `Empty slot ${it.slot + 1}`
                  }
                  className={`relative grid h-14 w-14 place-items-center rounded-lg border transition disabled:opacity-60 ${
                    it.selected
                      ? "border-emerald-400 bg-emerald-500/15 ring-2 ring-emerald-400/40"
                      : "border-slate-700 bg-slate-900 hover:border-slate-500"
                  }`}
                >
                  <span className="absolute left-1 top-0.5 text-[10px] font-bold text-slate-500">
                    {it.slot + 1}
                  </span>
                  {it.name ? (
                    <ItemIcon name={it.name} />
                  ) : (
                    <span className="text-slate-700">·</span>
                  )}
                  {it.count > 1 && (
                    <span className="absolute bottom-0.5 right-1 text-xs font-bold text-white drop-shadow">
                      {it.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="mr-2 flex items-center gap-2 text-sm text-slate-300">
                <span className="text-slate-500">Holding:</span>
                <span className="font-medium">
                  {snap?.heldItem ?? "empty hand"}
                </span>
                {snap?.using && (
                  <span className="text-xs text-amber-300">(using…)</span>
                )}
              </div>
              <button
                onClick={() => doAction("use")}
                disabled={acting || !snap?.heldItem}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
              >
                🖱 Right-click / Use (eat)
              </button>
              <button
                onClick={() => doAction("drop")}
                disabled={acting || !snap?.heldItem}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-40"
              >
                Drop
              </button>

              {beam.looping ? (
                <button
                  onClick={() => doAction("beam_stop")}
                  disabled={acting}
                  title="Stop the beam loop"
                  className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-semibold text-rose-950 transition hover:bg-rose-400 disabled:opacity-40"
                >
                  ⏹ Stop Beam
                </button>
              ) : (
                <button
                  onClick={() => doAction("beam_start")}
                  disabled={acting || status !== "online"}
                  title="Start the beam loop: recruit nearest player, AI-handled chat, auto-restart on deny/death until stopped"
                  className="rounded-lg bg-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-fuchsia-950 transition hover:bg-fuchsia-400 disabled:opacity-40"
                >
                  📡 Beam
                </button>
              )}

              <span className="ml-auto text-xs text-slate-600">
                Shortcuts: 1-9 select · R to use
              </span>
            </div>

            {beam.looping && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-fuchsia-500/10 px-3 py-2 text-xs text-fuchsia-200 ring-1 ring-fuchsia-500/20">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-fuchsia-400" />
                Beam looping — {beam.stage || "running…"}
              </div>
            )}
          </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-400">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 truncate font-medium text-slate-200">
        {children}
      </div>
    </div>
  );
}

function AboutPanel() {
  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm leading-relaxed text-slate-300">
      <h2 className="text-base font-semibold text-white">How it works</h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Click <b>Add bot</b> and paste your Minecraft access token (the bearer
          / Yggdrasil token issued after you log in at minecraft.net).
        </li>
        <li>
          Enter the <b>server IP</b> (e.g. <code>play.example.net</code> or{" "}
          <code>1.2.3.4:25565</code>).
        </li>
        <li>
          The server validates the token against Minecraft services, resolves
          your username, and connects with <code>mineflayer</code>.
        </li>
        <li>
          Each bot shows whether it <b>joined</b> the server, and you can open
          the <b>Console</b> to watch chat and send messages.
        </li>
      </ol>
      <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-300 ring-1 ring-amber-500/20">
        Note: tokens are short-lived. If a join fails with an auth error, grab a
        fresh token. Bots only run while this server process is alive.
      </p>
      <p className="rounded-lg bg-sky-500/10 px-3 py-2 text-sky-300 ring-1 ring-sky-500/20">
        Seeing <b>&quot;Disconnected: socketClosed&quot;</b>? That usually means a
        version mismatch through the server&apos;s proxy. Re-create the bot and
        set the exact <b>Minecraft version</b> the server runs. The manager also
        fetches your chat-signing certificates automatically so chat works on
        1.19+ servers.
      </p>
    </section>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-black/75 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-3xl animate-pop-in justify-center"
      >
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-300">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-700/80 bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-emerald-500/60 focus:bg-slate-950/80 focus:ring-2 focus:ring-emerald-500/20";

function logColor(level: LogEntry["level"]) {
  switch (level) {
    case "error":
      return "text-rose-300";
    case "system":
      return "text-sky-300";
    case "chat":
      return "text-slate-200";
    default:
      return "text-slate-300";
  }
}

// Detect private-message (whisper) lines so we can highlight them.
// Returns "from" (incoming DM), "to" (outgoing DM), or null.
function whisperKind(line: string): "from" | "to" | null {
  const l = line.toLowerCase();
  // Don't color our own injected "<you → X>" log line.
  if (/<you\s*→/.test(line)) return null;
  if (/\(from\b/.test(l) || /^\s*from\s+\w+/.test(l) || /whispers to you/.test(l))
    return "from";
  if (/\(to\b/.test(l) || /\byou whisper to\b/.test(l)) return "to";
  return null;
}
