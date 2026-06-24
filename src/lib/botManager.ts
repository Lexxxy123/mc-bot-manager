import crypto from "crypto";
import { db } from "@/db";
import { bots, type Bot } from "@/db/schema";
import { eq } from "drizzle-orm";

const globalForResume = globalThis as typeof globalThis & {
  __mcBotsResumed?: boolean;
};

// On server (re)start, reconnect every bot the user left enabled. Runs once.
export async function resumeEnabledBots(): Promise<void> {
  if (globalForResume.__mcBotsResumed) return;
  globalForResume.__mcBotsResumed = true;
  try {
    const enabled = await db
      .select()
      .from(bots)
      .where(eq(bots.enabled, "true"));
    for (const record of enabled) {
      // Stagger reconnects slightly so we don't hammer the auth/services API.
      setTimeout(
        () => {
          void startBot(record);
        },
        500 + Math.random() * 2500,
      );
    }
  } catch {
    // ignore — DB may not be ready yet
  }
}

export type BotStatus = "offline" | "connecting" | "online" | "error";

export type LogEntry = {
  ts: number;
  level: "info" | "chat" | "error" | "system";
  line: string;
};

type BotRuntime = {
  id: string;
  status: BotStatus;
  joined: boolean;
  lastError: string | null;
  logs: LogEntry[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bot: any | null;
  manualStop: boolean;
  using: boolean;
  beaming: boolean;
  beamStage: string;
  beamLoop: boolean;
  humanizer: ReturnType<typeof setTimeout> | null;
};

const MAX_LOGS = 300;

const globalForBots = globalThis as typeof globalThis & {
  __mcBotRuntimes?: Map<string, BotRuntime>;
};

const runtimes: Map<string, BotRuntime> =
  globalForBots.__mcBotRuntimes ?? new Map();
globalForBots.__mcBotRuntimes = runtimes;

function getOrCreateRuntime(id: string): BotRuntime {
  let rt = runtimes.get(id);
  if (!rt) {
    rt = {
      id,
      status: "offline",
      joined: false,
      lastError: null,
      logs: [],
      bot: null,
      manualStop: false,
      using: false,
      beaming: false,
      beamStage: "",
      beamLoop: false,
      humanizer: null,
    };
    runtimes.set(id, rt);
  }
  return rt;
}

function log(rt: BotRuntime, level: LogEntry["level"], line: string) {
  rt.logs.push({ ts: Date.now(), level, line });
  if (rt.logs.length > MAX_LOGS) {
    rt.logs.splice(0, rt.logs.length - MAX_LOGS);
  }
}

async function setDbStatus(
  id: string,
  status: BotStatus,
  lastError: string | null = null,
) {
  try {
    await db.update(bots).set({ status, lastError }).where(eq(bots.id, id));
  } catch {
    // ignore db errors for status sync
  }
}

type ProxyConfig = {
  type: 4 | 5;
  host: string;
  port: number;
  userId?: string;
  password?: string;
};

// Parse strings like:
//   socks5://user:pass@1.2.3.4:1080
//   socks4://1.2.3.4:1080
//   1.2.3.4:1080   (defaults to socks5)
function parseProxy(raw: string | null | undefined): ProxyConfig | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  let type: 4 | 5 = 5;
  let rest = s;
  const schemeMatch = s.match(/^(socks5h?|socks4|socks):\/\//i);
  if (schemeMatch) {
    type = /4/.test(schemeMatch[1]) ? 4 : 5;
    rest = s.slice(schemeMatch[0].length);
  }
  let userId: string | undefined;
  let password: string | undefined;
  const atIdx = rest.lastIndexOf("@");
  if (atIdx > -1) {
    const cred = rest.slice(0, atIdx);
    rest = rest.slice(atIdx + 1);
    const ci = cred.indexOf(":");
    if (ci > -1) {
      userId = cred.slice(0, ci);
      password = cred.slice(ci + 1);
    } else {
      userId = cred;
    }
  }
  const colon = rest.lastIndexOf(":");
  if (colon < 0) return null;
  const host = rest.slice(0, colon);
  const port = Number(rest.slice(colon + 1));
  if (!host || !Number.isFinite(port) || port <= 0 || port >= 65536) return null;
  return { type, host, port, userId, password };
}

type MinecraftProfile = { id: string; name: string };

async function resolveProfile(token: string): Promise<MinecraftProfile> {
  const res = await fetch(
    "https://api.minecraftservices.com/minecraft/profile",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Token rejected by Minecraft services (HTTP ${res.status}). ${text.slice(0, 140)}`,
    );
  }
  const data = (await res.json()) as { id?: string; name?: string };
  if (!data.id || !data.name) {
    throw new Error("Minecraft profile response missing id/name");
  }
  return { id: data.id, name: data.name };
}

// Convert a PEM block to DER bytes (matches prismarine-auth's helper).
function toDER(pem: string): Buffer {
  return pem
    .split("\n")
    .slice(1, -1)
    .reduce(
      (acc, cur) => Buffer.concat([acc, Buffer.from(cur, "base64")]),
      Buffer.alloc(0),
    );
}

// Fetch the account's chat-signing key pair so the bot can join 1.19+ servers
// that enforce secure chat and can send/receive signed messages.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchProfileKeys(token: string): Promise<any> {
  const res = await fetch(
    "https://api.minecraftservices.com/player/certificates",
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`certificates HTTP ${res.status}`);
  }
  const cert = (await res.json()) as {
    keyPair: { publicKey: string; privateKey: string };
    publicKeySignature?: string;
    publicKeySignatureV2?: string;
    expiresAt: string;
    refreshedAfter: string;
  };
  const publicDER = toDER(cert.keyPair.publicKey);
  const privateDER = toDER(cert.keyPair.privateKey);
  return {
    publicPEM: cert.keyPair.publicKey,
    privatePEM: cert.keyPair.privateKey,
    publicDER,
    privateDER,
    signature: cert.publicKeySignature
      ? Buffer.from(cert.publicKeySignature, "base64")
      : undefined,
    signatureV2: cert.publicKeySignatureV2
      ? Buffer.from(cert.publicKeySignatureV2, "base64")
      : undefined,
    expiresOn: new Date(cert.expiresAt),
    refreshAfter: new Date(cert.refreshedAfter),
    public: crypto.createPublicKey({
      key: publicDER,
      format: "der",
      type: "spki",
    }),
    private: crypto.createPrivateKey({
      key: privateDER,
      format: "der",
      type: "pkcs8",
    }),
  };
}

// --- Humanizer: subtle, randomized idle behaviour so the bot doesn't move/act
// like a perfectly static machine. This mimics a real player's tiny head
// movements and natural timing variance. (Helps on normal servers; it does
// NOT defeat hardened paid anticheat like mcpvp.)
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function humanGap(base: number, spread = 0.25): number {
  // Returns base ms +/- a random spread so timings never look robotic.
  const delta = base * spread;
  return Math.max(120, Math.round(base + rand(-delta, delta)));
}

function startHumanizer(rt: BotRuntime) {
  stopHumanizer(rt);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bot: any = rt.bot;
  if (!bot) return;

  const tick = () => {
    try {
      if (
        bot &&
        bot.entity &&
        rt.status === "online" &&
        // Don't fight the beam's deliberate movements.
        !rt.beaming
      ) {
        // Occasionally make a tiny, natural head movement.
        if (Math.random() < 0.6) {
          const yaw = (bot.entity.yaw ?? 0) + rand(-0.35, 0.35);
          const pitch = Math.max(
            -1.2,
            Math.min(1.2, (bot.entity.pitch ?? 0) + rand(-0.18, 0.18)),
          );
          bot.look(yaw, pitch, false);
        }
        // Rare micro sneak-tap (very human, harmless).
        if (Math.random() < 0.05) {
          bot.setControlState("sneak", true);
          setTimeout(() => {
            try {
              bot.setControlState("sneak", false);
            } catch {
              // ignore
            }
          }, rand(120, 320));
        }
      }
    } catch {
      // ignore
    }
    rt.humanizer = setTimeout(tick, humanGap(3500, 0.5));
  };
  rt.humanizer = setTimeout(tick, humanGap(3000, 0.5));
}

function stopHumanizer(rt: BotRuntime) {
  if (rt.humanizer) {
    clearTimeout(rt.humanizer);
    rt.humanizer = null;
  }
}

export function getRuntimeView(id: string) {
  const rt = runtimes.get(id);
  if (!rt) {
    return {
      status: "offline" as BotStatus,
      joined: false,
      lastError: null as string | null,
    };
  }
  return { status: rt.status, joined: rt.joined, lastError: rt.lastError };
}

export function getLogs(id: string): LogEntry[] {
  const rt = runtimes.get(id);
  return rt ? rt.logs : [];
}

export async function startBot(record: Bot): Promise<void> {
  const rt = getOrCreateRuntime(record.id);
  rt.manualStop = false;

  // Tear down any existing connection first.
  if (rt.bot) {
    try {
      rt.bot.removeAllListeners();
      rt.bot.quit();
    } catch {
      // ignore
    }
    rt.bot = null;
  }

  rt.status = "connecting";
  rt.joined = false;
  rt.lastError = null;
  const versionLabel =
    record.version && record.version !== "auto" ? record.version : "auto-detect";
  log(
    rt,
    "system",
    `Connecting to ${record.host}:${record.port} (version: ${versionLabel}) ...`,
  );
  await setDbStatus(record.id, "connecting");

  let profile: MinecraftProfile;
  try {
    log(rt, "system", "Validating Minecraft token...");
    profile = await resolveProfile(record.token);
    log(rt, "system", `Authenticated as ${profile.name} (${profile.id}).`);
    await db
      .update(bots)
      .set({ username: profile.name, uuid: profile.id })
      .where(eq(bots.id, record.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    rt.status = "error";
    rt.lastError = msg;
    log(rt, "error", msg);
    await setDbStatus(record.id, "error", msg);
    return;
  }

  let mineflayer: typeof import("mineflayer");
  try {
    mineflayer = await import("mineflayer");
  } catch (err) {
    const msg =
      "Failed to load mineflayer: " +
      (err instanceof Error ? err.message : String(err));
    rt.status = "error";
    rt.lastError = msg;
    log(rt, "error", msg);
    await setDbStatus(record.id, "error", msg);
    return;
  }

  // Pre-fetch chat-signing certificates (best effort).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let profileKeys: any = null;
  try {
    profileKeys = await fetchProfileKeys(record.token);
    log(rt, "system", "Fetched chat-signing certificates.");
  } catch {
    log(
      rt,
      "system",
      "Could not fetch chat certificates (continuing without chat signing).",
    );
  }

  const usePinnedVersion =
    record.version && record.version !== "auto" ? record.version : false;

  // Optional SOCKS proxy support.
  const proxyConf = parseProxy(record.proxy);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let connectFn: ((client: any) => void) | undefined;
  if (proxyConf) {
    let SocksClient: typeof import("socks").SocksClient;
    try {
      ({ SocksClient } = await import("socks"));
    } catch (err) {
      const msg =
        "Proxy requested but 'socks' failed to load: " +
        (err instanceof Error ? err.message : String(err));
      rt.status = "error";
      rt.lastError = msg;
      log(rt, "error", msg);
      await setDbStatus(record.id, "error", msg);
      return;
    }
    log(
      rt,
      "system",
      `Routing through SOCKS${proxyConf.type} proxy ${proxyConf.host}:${proxyConf.port} ...`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connectFn = (client: any) => {
      SocksClient.createConnection(
        {
          proxy: {
            host: proxyConf.host,
            port: proxyConf.port,
            type: proxyConf.type,
            userId: proxyConf.userId,
            password: proxyConf.password,
          },
          command: "connect",
          destination: { host: record.host, port: record.port },
          timeout: 20000,
        },
        (err, info) => {
          if (err || !info) {
            const m = "Proxy connection failed: " + (err?.message || "unknown");
            rt.lastError = m;
            log(rt, "error", m);
            client.emit("error", err || new Error("proxy connect failed"));
            return;
          }
          client.setSocket(info.socket);
          client.emit("connect");
        },
      );
    };
  }

  try {
    const bot = mineflayer.createBot({
      host: record.host,
      port: record.port,
      username: profile.name,
      version: usePinnedVersion,
      hideErrors: true,
      // Present a realistic vanilla client fingerprint to reduce anticheat
      // flags on normal servers. (Note: this cannot defeat hardened paid
      // anticheats that fingerprint behaviour, e.g. mcpvp.)
      brand: "vanilla",
      viewDistance: "far",
      chatLengthLimit: 256,
      checkTimeoutInterval: 60 * 1000,
      ...(connectFn ? { connect: connectFn } : {}),
      // Custom auth: inject the bearer token session + certificates ourselves.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      auth: (client: any, options: any) => {
        client.session = {
          accessToken: record.token,
          selectedProfile: { id: profile.id, name: profile.name },
          availableProfiles: [{ id: profile.id, name: profile.name }],
        };
        client.username = profile.name;
        options.accessToken = record.token;
        options.haveCredentials = true;
        if (profileKeys) client.profileKeys = profileKeys;
        // Respect a custom proxy connect function if present.
        if (connectFn) options.connect = connectFn;
        client.emit("session", client.session);
        options.connect(client);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    rt.bot = bot;

    const timeout = setTimeout(() => {
      if (!rt.joined && rt.status === "connecting") {
        const msg = "Connection timed out (server did not respond in 45s).";
        rt.status = "error";
        rt.lastError = msg;
        log(rt, "error", msg);
        void setDbStatus(record.id, "error", msg);
        try {
          bot.quit();
        } catch {
          // ignore
        }
      }
    }, 45000);

    bot.once("login", () => {
      log(rt, "system", "Logged in to the server.");
    });

    bot.once("spawn", () => {
      clearTimeout(timeout);
      rt.joined = true;
      rt.status = "online";
      rt.lastError = null;
      const v = bot.version ? ` (protocol ${bot.version})` : "";
      log(
        rt,
        "system",
        `✅ Joined ${record.host}:${record.port} successfully${v}.`,
      );
      void setDbStatus(record.id, "online");

      // Send a vanilla-style client settings packet and brand so the server
      // sees the same data a real Java client reports.
      try {
        // Tell the server our "vanilla" brand via the standard plugin channel.
        const brandBuf = Buffer.concat([
          Buffer.from([7]), // length-prefix for "vanilla" (varint, < 128)
          Buffer.from("vanilla", "utf8"),
        ]);
        if (typeof bot._client?.write === "function") {
          // Newer protocol uses "minecraft:brand", older uses "MC|Brand".
          try {
            bot._client.write("custom_payload", {
              channel: "minecraft:brand",
              data: brandBuf,
            });
          } catch {
            try {
              bot._client.write("custom_payload", {
                channel: "MC|Brand",
                data: brandBuf,
              });
            } catch {
              // ignore
            }
          }
        }
        // Vanilla default client settings.
        bot.setSettings({
          chat: "enabled",
          colorsEnabled: true,
          viewDistance: "far",
          skinParts: {
            showCape: true,
            showJacket: true,
            showLeftSleeve: true,
            showRightSleeve: true,
            showLeftPants: true,
            showRightPants: true,
            showHat: true,
          },
          mainHand: "right",
        });
      } catch {
        // settings packet best-effort
      }

      // Start subtle human-like idle behaviour so the bot isn't perfectly
      // static (real players constantly make tiny head movements / shifts).
      startHumanizer(rt);
    });

    // Plain-text chat / system messages from the server.
    bot.on("messagestr", (message: string) => {
      log(rt, "chat", message);
    });

    bot.on("kicked", (reason: unknown) => {
      clearTimeout(timeout);
      let reasonText: string;
      try {
        reasonText =
          typeof reason === "string" ? reason : JSON.stringify(reason);
      } catch {
        reasonText = String(reason);
      }
      const msg = "Kicked: " + reasonText;
      rt.status = "error";
      rt.lastError = msg;
      rt.joined = false;
      log(rt, "error", msg);
      void setDbStatus(record.id, "error", msg);
    });

    bot.on("error", (err: Error) => {
      clearTimeout(timeout);
      const msg = err?.message || String(err);
      if (!rt.manualStop) {
        rt.status = "error";
        rt.lastError = msg;
        log(rt, "error", msg);
        void setDbStatus(record.id, "error", msg);
      }
    });

    bot.on("end", (reason: string) => {
      clearTimeout(timeout);
      stopHumanizer(rt);
      rt.joined = false;
      rt.bot = null;
      if (rt.manualStop) {
        rt.status = "offline";
        log(rt, "system", "Bot stopped.");
        void setDbStatus(record.id, "offline");
      } else if (rt.status !== "error") {
        const wasConnecting = !rt.joined;
        rt.status = wasConnecting ? "error" : "offline";
        const reasonText = reason ?? "connection ended";
        log(rt, wasConnecting ? "error" : "system", `Disconnected: ${reasonText}`);
        // socketClosed before ever joining almost always = protocol/version
        // mismatch through the server's proxy (e.g. 1.8 practice servers).
        if (
          wasConnecting &&
          String(reasonText).toLowerCase().includes("socketclosed")
        ) {
          const hint =
            usePinnedVersion === false
              ? "Hint: auto-detect failed. Re-create this bot and pin the exact server version. PvP/practice networks (minemen, etc.) are usually 1.8.9."
              : `Hint: version ${usePinnedVersion} was refused. Try a different version that matches the server.`;
          rt.lastError = `Disconnected: ${reasonText}. ${hint}`;
          log(rt, "system", hint);
        } else if (wasConnecting) {
          rt.lastError = `Disconnected: ${reasonText}`;
        }
        void setDbStatus(record.id, rt.status, rt.lastError);
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    rt.status = "error";
    rt.lastError = msg;
    log(rt, "error", msg);
    await setDbStatus(record.id, "error", msg);
  }
}

export async function stopBot(id: string): Promise<void> {
  const rt = getOrCreateRuntime(id);
  rt.manualStop = true;
  rt.beamLoop = false;
  stopHumanizer(rt);
  if (rt.bot) {
    log(rt, "system", "Stopping bot...");
    try {
      rt.bot.quit();
    } catch {
      // ignore
    }
    rt.bot = null;
  }
  rt.status = "offline";
  rt.joined = false;
  await setDbStatus(id, "offline");
}

export function sendChat(id: string, message: string): boolean {
  const rt = runtimes.get(id);
  if (!rt || !rt.bot || rt.status !== "online") return false;
  try {
    rt.bot.chat(message);
    log(rt, "chat", `<you> ${message}`);
    return true;
  } catch (err) {
    log(rt, "error", "Failed to send chat: " + (err instanceof Error ? err.message : String(err)));
    return false;
  }
}

export type ViewEntity = {
  name: string;
  type: string;
  kind: "player" | "mob" | "object" | "other";
  // Position relative to bot, rotated so +Z is where the bot faces.
  forward: number;
  right: number;
  dy: number;
  distance: number;
  // Absolute angle (radians) relative to bot's facing (0 = straight ahead).
  bearing: number;
};

export type HotbarItem = {
  slot: number; // 0-8
  name: string | null; // e.g. "cooked_beef"
  displayName: string | null; // e.g. "Steak"
  count: number;
  selected: boolean;
};

export type ViewSnapshot = {
  available: boolean;
  username: string;
  position: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  facing: string;
  health: number;
  food: number;
  dimension: string;
  timeOfDay: number;
  isDay: boolean;
  heldItem: string | null;
  lookingAt: { name: string; x: number; y: number; z: number } | null;
  entities: ViewEntity[];
  nearbyBlocks: { name: string; forward: number; right: number; dy: number }[];
  hotbar: HotbarItem[];
  selectedSlot: number;
  using: boolean;
};

function cardinal(yaw: number): string {
  // mineflayer yaw: 0 = south(+z), increases counter-clockwise
  const deg = ((yaw * 180) / Math.PI + 360) % 360;
  const dirs = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"];
  return dirs[Math.round(deg / 45) % 8];
}

export function getViewSnapshot(id: string): ViewSnapshot | null {
  const rt = runtimes.get(id);
  if (!rt || !rt.bot || rt.status !== "online" || !rt.bot.entity) {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bot: any = rt.bot;
  const pos = bot.entity.position;
  const yaw = bot.entity.yaw ?? 0;
  const pitch = bot.entity.pitch ?? 0;

  // Build a rotation so "forward" aligns with the direction the bot faces.
  // Bot forward vector: x = -sin(yaw), z = cos(yaw) (Minecraft convention).
  const fx = -Math.sin(yaw);
  const fz = Math.cos(yaw);
  // Right vector (perpendicular, to the bot's right).
  const rx = -Math.cos(yaw);
  const rz = -Math.sin(yaw);

  const entities: ViewEntity[] = [];
  try {
    for (const key of Object.keys(bot.entities)) {
      const e = bot.entities[key];
      if (!e || e === bot.entity || !e.position) continue;
      const dx = e.position.x - pos.x;
      const dz = e.position.z - pos.z;
      const dy = e.position.y - pos.y;
      const distance = Math.sqrt(dx * dx + dz * dz + dy * dy);
      if (distance > 64) continue;
      const forward = dx * fx + dz * fz;
      const right = dx * rx + dz * rz;
      const bearing = Math.atan2(right, forward);
      let kind: ViewEntity["kind"] = "other";
      if (e.type === "player") kind = "player";
      else if (e.type === "mob" || e.type === "animal" || e.type === "hostile")
        kind = "mob";
      else if (e.type === "object" || e.type === "orb") kind = "object";
      const name =
        e.username ||
        e.displayName ||
        (e.name ? String(e.name) : null) ||
        e.type ||
        "entity";
      entities.push({
        name: String(name),
        type: String(e.type ?? "unknown"),
        kind,
        forward: Math.round(forward * 10) / 10,
        right: Math.round(right * 10) / 10,
        dy: Math.round(dy * 10) / 10,
        distance: Math.round(distance * 10) / 10,
        bearing,
      });
    }
  } catch {
    // ignore entity read errors
  }
  entities.sort((a, b) => a.distance - b.distance);

  let lookingAt: ViewSnapshot["lookingAt"] = null;
  try {
    const block = bot.blockAtCursor ? bot.blockAtCursor(6) : null;
    if (block) {
      lookingAt = {
        name: block.name,
        x: block.position.x,
        y: block.position.y,
        z: block.position.z,
      };
    }
  } catch {
    // ignore
  }

  // Sample a small ring of nearby blocks at foot level for a minimap feel.
  const nearbyBlocks: ViewSnapshot["nearbyBlocks"] = [];
  try {
    const Vec3 = bot.entity.position.constructor;
    for (let ox = -6; ox <= 6; ox += 2) {
      for (let oz = -6; oz <= 6; oz += 2) {
        if (ox === 0 && oz === 0) continue;
        const bx = Math.floor(pos.x) + ox;
        const bz = Math.floor(pos.z) + oz;
        const by = Math.floor(pos.y) - 1;
        const b = bot.blockAt(new Vec3(bx, by, bz));
        if (b && b.name && b.name !== "air" && b.boundingBox !== "empty") {
          const dx = bx + 0.5 - pos.x;
          const dz = bz + 0.5 - pos.z;
          nearbyBlocks.push({
            name: b.name,
            forward: Math.round((dx * fx + dz * fz) * 10) / 10,
            right: Math.round((dx * rx + dz * rz) * 10) / 10,
            dy: -1,
          });
        }
      }
    }
  } catch {
    // ignore
  }

  let heldItem: string | null = null;
  try {
    heldItem = bot.heldItem ? bot.heldItem.displayName || bot.heldItem.name : null;
  } catch {
    // ignore
  }

  // Build the 9-slot hotbar. In Minecraft the hotbar maps to inventory
  // slots 36..44, and bot.quickBarSlot (0..8) is the currently selected slot.
  const selectedSlot = Number(bot.quickBarSlot ?? 0);
  const hotbar: HotbarItem[] = [];
  try {
    const slots = bot.inventory?.slots ?? [];
    for (let i = 0; i < 9; i++) {
      const item = slots[36 + i];
      hotbar.push({
        slot: i,
        name: item ? String(item.name) : null,
        displayName: item ? String(item.displayName ?? item.name) : null,
        count: item ? Number(item.count ?? 1) : 0,
        selected: i === selectedSlot,
      });
    }
  } catch {
    for (let i = 0; i < 9; i++) {
      hotbar.push({
        slot: i,
        name: null,
        displayName: null,
        count: 0,
        selected: i === selectedSlot,
      });
    }
  }

  const timeOfDay = bot.time ? Number(bot.time.timeOfDay ?? 0) : 0;

  return {
    available: true,
    username: bot.username ?? "bot",
    position: {
      x: Math.round(pos.x * 100) / 100,
      y: Math.round(pos.y * 100) / 100,
      z: Math.round(pos.z * 100) / 100,
    },
    yaw,
    pitch,
    facing: cardinal(yaw),
    health: Math.round((bot.health ?? 0) * 10) / 10,
    food: Math.round((bot.food ?? 0) * 10) / 10,
    dimension: String(bot.game?.dimension ?? "overworld"),
    timeOfDay,
    isDay: timeOfDay < 13000,
    heldItem,
    lookingAt,
    entities: entities.slice(0, 40),
    nearbyBlocks,
    hotbar,
    selectedSlot,
    using: rt.using === true,
  };
}

// ----- Bot actions: select hotbar slot, use/right-click, eat, drop -----

export type BotActionResult = { ok: boolean; message: string };

export async function selectHotbarSlot(
  id: string,
  slot: number,
): Promise<BotActionResult> {
  const rt = runtimes.get(id);
  if (!rt || !rt.bot || rt.status !== "online") {
    return { ok: false, message: "Bot is not online" };
  }
  if (slot < 0 || slot > 8) {
    return { ok: false, message: "Slot must be 0-8" };
  }
  try {
    await rt.bot.setQuickBarSlot(slot);
    const held = rt.bot.heldItem;
    const label = held ? held.displayName || held.name : "empty hand";
    log(rt, "system", `Selected hotbar slot ${slot + 1} (${label}).`);
    return { ok: true, message: `Selected slot ${slot + 1}` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function useHeldItem(id: string): Promise<BotActionResult> {
  const rt = runtimes.get(id);
  if (!rt || !rt.bot || rt.status !== "online") {
    return { ok: false, message: "Bot is not online" };
  }
  const held = rt.bot.heldItem;
  if (!held) {
    return { ok: false, message: "Nothing in hand to use" };
  }
  try {
    // bot.consume() handles food/potions; fall back to activateItem otherwise.
    const name = String(held.name);
    const isConsumable =
      /(beef|porkchop|chicken|mutton|rabbit|cod|salmon|bread|apple|carrot|potato|beetroot|melon|berries|cookie|pie|stew|soup|honey|milk|potion|chorus|kelp|rotten|spider_eye|pufferfish|tropical)/i.test(
        name,
      );
    rt.using = true;
    if (isConsumable && typeof rt.bot.consume === "function") {
      log(rt, "system", `Eating/consuming ${held.displayName || name}...`);
      await rt.bot.consume();
      log(rt, "system", `Finished consuming ${held.displayName || name}.`);
    } else {
      log(rt, "system", `Right-click using ${held.displayName || name}...`);
      rt.bot.activateItem();
      // Hold for a moment then release (covers bow draw, shield, etc.)
      await new Promise((r) => setTimeout(r, 1600));
      try {
        rt.bot.deactivateItem();
      } catch {
        // ignore
      }
    }
    rt.using = false;
    return { ok: true, message: "Used item" };
  } catch (err) {
    rt.using = false;
    const msg = err instanceof Error ? err.message : String(err);
    log(rt, "error", `Use item failed: ${msg}`);
    return { ok: false, message: msg };
  }
}

export async function dropHeldItem(id: string): Promise<BotActionResult> {
  const rt = runtimes.get(id);
  if (!rt || !rt.bot || rt.status !== "online") {
    return { ok: false, message: "Bot is not online" };
  }
  const held = rt.bot.heldItem;
  if (!held) {
    return { ok: false, message: "Nothing in hand to drop" };
  }
  try {
    await rt.bot.tossStack(held);
    log(rt, "system", `Dropped ${held.displayName || held.name}.`);
    return { ok: true, message: "Dropped item" };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ----------------- BEAM: scripted recruit + conversational AI ----------------

export function getBeamState(id: string): {
  beaming: boolean;
  looping: boolean;
  stage: string;
} {
  const rt = runtimes.get(id);
  if (!rt) return { beaming: false, looping: false, stage: "" };
  return { beaming: rt.beaming, looping: rt.beamLoop, stage: rt.beamStage };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A valid Minecraft username: 3-16 chars, letters/digits/underscore only.
// This rejects color-code junk like "§r" that would get us kicked for
// "Illegal characters in chat".
function isValidUsername(name: unknown): name is string {
  return typeof name === "string" && /^[A-Za-z0-9_]{3,16}$/.test(name);
}

// Strip Minecraft formatting/color codes and trim.
function cleanName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\u00A7./g, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .trim();
}

// Find the nearest other player. Returns a VALID username or null.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findNearestPlayer(bot: any, selfName: string): string | null {
  try {
    const entity = bot.nearestEntity(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) =>
        e.type === "player" &&
        e !== bot.entity &&
        isValidUsername(e.username) &&
        e.username.toLowerCase() !== selfName.toLowerCase(),
    );
    if (entity && isValidUsername(entity.username)) {
      return String(entity.username);
    }
  } catch {
    // ignore
  }
  // Fallback: scan the players map for the closest VALID-named player.
  try {
    const me = bot.entity?.position;
    let best: string | null = null;
    let bestDist = Infinity;
    for (const name of Object.keys(bot.players || {})) {
      if (!isValidUsername(name)) continue;
      if (name.toLowerCase() === selfName.toLowerCase()) continue;
      const p = bot.players[name];
      const ent = p?.entity;
      if (ent?.position && me) {
        const d = ent.position.distanceTo(me);
        if (d < bestDist) {
          bestDist = d;
          best = name;
        }
      } else if (!best) {
        best = name;
      }
    }
    return best;
  } catch {
    return null;
  }
}

type BeamIntent = "positive" | "negative" | "question" | "neutral";
type AiTurn = { intent: BeamIntent; reply: string };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Strictly detect a whisper FROM a specific player (not chat/kill messages).
// Supports common formats: "(From X) msg", "From X: msg", "X whispers: msg",
// "X -> me: msg".
function parseWhisperFrom(line: string, target: string): string | null {
  const t = escapeRegex(target);
  const patterns: RegExp[] = [
    new RegExp(`\\(from ${t}\\)\\s*:?\\s*(.+)`, "i"),
    new RegExp(`^\\s*from ${t}\\s*:?\\s*(.+)`, "i"),
    new RegExp(`^\\s*${t}\\s+whispers(?:\\s+to\\s+you)?\\s*:?\\s*(.+)`, "i"),
    new RegExp(`^\\s*${t}\\s*->\\s*me\\s*:?\\s*(.+)`, "i"),
  ];
  for (const re of patterns) {
    const m = line.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

// Detect a PUBLIC chat message from the target player, e.g.:
//   "Kotofey52: no bro"
//   "[MVP] Kotofey52: yo"
//   "✦ [✽] Kotofey52 |I| rank: msg"
// Returns the message text, or null if this line isn't the target talking.
function parsePublicChatFrom(line: string, target: string): string | null {
  const t = escapeRegex(target);
  // The username, possibly with rank tags/symbols before it, then ": message".
  // We require the target name to appear immediately before the first " :".
  const re = new RegExp(`(?:^|[^a-z0-9_])${t}\\b[^:]*:\\s*(.+)$`, "i");
  const m = line.match(re);
  if (!m || !m[1]) return null;
  const msg = m[1].trim();
  // Guard against false positives from server/system lines.
  if (!msg) return null;
  return msg;
}

// Conversational AI via Pollinations. Returns intent + an in-character reply.
async function aiConverse(
  channel: string,
  selfName: string,
  history: { who: "me" | "them"; text: string }[],
  latest: string,
  serverIp = "badlion-pvp.xyz",
): Promise<AiTurn> {
  const key =
    process.env.POLLINATIONS_API_KEY || "sk_PpVAtAY5ACUBJJAhQm5LIG2vNutlowEb";
  const model = process.env.POLLINATIONS_MODEL || "openai";

  // Pull learned guidelines if AI training is enabled.
  let learnings = "";
  try {
    const { getTrainingState } = await import("@/lib/training");
    const t = await getTrainingState();
    if (t.training && t.learnings) learnings = t.learnings;
  } catch {
    // ignore
  }

  const convo = history
    .map((h) => `${h.who === "me" ? "me" : "them"}: ${h.text}`)
    .join("\n");

  const prompt =
    `You are a real Minecraft player named ${selfName} talking to another player in chat. ` +
    `You want them to TEAM UP with you for a 2v2 challenge that you're filming for your YouTube channel "${channel}". If you both win, you both get a rank-up. ` +
    `IMPORTANT FACTS you know and should use naturally if asked:\n` +
    `- the 2v2 starts really soon, in like 5-10 mins\n` +
    `- it's for your yt channel "${channel}"\n` +
    `- you can pick a normal minecraft gamemode/kit (sword, crystal, sumo, nodebuff, etc). if they ask what gamemode, suggest one casually or ask what theyre good at\n` +
    `- your discord is stood014\n` +
    `- the server ip to join is "${serverIp}" — give this if they CANT use discord, dont have discord, or just to tell them where to play\n\n` +
    `HOW TO TALK (VERY IMPORTANT):\n` +
    `- talk like a normal chill mc player: short, lowercase, casual, typos ok, no punctuation, no emojis\n` +
    `- ONE thought per reply. keep it to a single short line like a real person typing fast. NEVER info-dump\n` +
    `- DO NOT randomly mention your youtube channel name. only say the channel name "${channel}" IF they directly ask what your channel is\n` +
    `- dont cram gamemode + discord + channel + ip all into one message. say one thing, wait for their reply, then continue\n` +
    `- be friendly and a bit needy for help (you genuinely need a teammate) but DO NOT sound desperate, spammy or like a bot\n` +
    `- be polite: naturally use words like "pls", "please", "thanks", "thank u", "ty", "appreciate it", "u down?" when they fit\n` +
    `- if they say they cant use discord / dont have it, DONT give up — react naturally (like "ohh how come" or "all good") and give them the server ip "${serverIp}" instead\n` +
    `- answer their questions directly and honestly using the facts above, but keep it brief\n\n` +
    (learnings
      ? `LEARNED GUIDELINES (follow these, they come from past successful chats):\n${learnings}\n\n`
      : "") +
    `Decide the intent of their LATEST message and write your next reply.\n` +
    `Output ONLY strict minified JSON: {"intent":"positive|negative|question|neutral","reply":"<your short casual reply>"}.\n` +
    `intent meanings:\n` +
    `- positive = they agree / are down to help / clearly interested in teaming\n` +
    `- negative = they hard refuse, insult you, tell you to stop, or clearly not interested. NOTE: "i cant use discord" is NOT negative — thats a question/neutral, give them the ip instead\n` +
    `- question = they are asking something (when, what gamemode, what channel, why, cant use discord, etc) — answer it in reply and keep them interested\n` +
    `- neutral = off-topic, game spam, or unclear\n\n` +
    (convo ? `conversation so far:\n${convo}\n\n` : "") +
    `their latest message: ${latest}`;

  try {
    const url = `https://gen.pollinations.ai/text/${encodeURIComponent(
      prompt,
    )}?model=${encodeURIComponent(model)}&key=${encodeURIComponent(key)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const raw = (await res.text()).trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const obj = JSON.parse(jsonMatch[0]);
          const intent = String(obj.intent || "").toLowerCase();
          const reply = String(obj.reply || "").slice(0, 120);
          if (
            intent === "positive" ||
            intent === "negative" ||
            intent === "question" ||
            intent === "neutral"
          ) {
            return { intent: intent as BeamIntent, reply };
          }
        } catch {
          // fall through
        }
      }
      // No JSON — try to infer intent from text.
      const low = raw.toLowerCase();
      if (low.includes("positive")) return { intent: "positive", reply: "" };
      if (low.includes("negative")) return { intent: "negative", reply: "" };
      if (low.includes("question")) return { intent: "question", reply: raw };
    }
  } catch {
    // fall through to heuristic
  }

  // Heuristic fallback.
  const t = latest.toLowerCase();
  if (/\b(channel|chanel|yt|youtube|name|what.?s it called)\b/.test(t)) {
    return { intent: "question", reply: `its ${channel}` };
  }
  if (
    /\b(yes|yea|yeah|yep|sure|ok|okay|kk|alr|alright|down|lets|let's|bet|fs|for sure|ofc|aight|ight|yessir|why not|i can|i'?ll help|help)\b/.test(
      t,
    )
  ) {
    return { intent: "positive", reply: "lets go" };
  }
  if (
    /\b(no|nah|nope|cant|can'?t|busy|stop|leave|go away|stfu|noob|cringe|scam|bot|never|nty|idc|annoying)\b/.test(
      t,
    )
  ) {
    return { intent: "negative", reply: "" };
  }
  return { intent: "neutral", reply: "" };
}

// Run ONE recruit attempt against the nearest player. Returns an outcome.
async function runBeamOnce(
  rt: BotRuntime,
  channel: string,
  serverIp: string,
): Promise<"positive" | "negative" | "died" | "noplayer" | "stopped"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bot: any = rt.bot;
  const self = String(bot.username || "bot");
  const SEND_GAP = 2600;

  // 1) Hold hotbar slot 3 + right-click.
  rt.beamStage = "equipping (slot 3 + right click)";
  log(rt, "system", "🔆 Beam: slot 3 + right-click.");
  try {
    await bot.setQuickBarSlot(2);
  } catch {
    // ignore
  }
  await sleep(300);
  try {
    bot.activateItem();
    await sleep(600);
    bot.deactivateItem();
  } catch {
    // ignore
  }

  if (!rt.beamLoop) return "stopped";

  // 2s pause, then walk forward 2s.
  rt.beamStage = "waiting 2s after item";
  log(rt, "system", "🔆 Beam: waiting 2s after item use.");
  await sleep(2000);
  rt.beamStage = "walking forward";
  log(rt, "system", "🔆 Beam: walking forward 2s.");
  try {
    bot.setControlState("forward", true);
    await sleep(2000);
    bot.setControlState("forward", false);
  } catch {
    try {
      bot.clearControlStates();
    } catch {
      // ignore
    }
  }

  if (!rt.beamLoop) return "stopped";

  // Find nearest player.
  const target = findNearestPlayer(bot, self);
  if (!target || !isValidUsername(target)) {
    rt.beamStage = "no valid player nearby";
    log(rt, "system", "🔆 Beam: no valid nearby player found.");
    return "noplayer";
  }
  log(rt, "system", `🔆 Beam: target → ${target}.`);

  // Death detection.
  let died = false;
  const onDeath = () => {
    died = true;
  };
  bot.once("death", onDeath);

  // Detect when the target player leaves the game.
  let targetLeft = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onPlayerLeft = (player: any) => {
    if (
      player?.username &&
      String(player.username).toLowerCase() === target.toLowerCase()
    ) {
      targetLeft = true;
    }
  };
  bot.on("playerLeft", onPlayerLeft);

  // Persistent reply capture: whispers FROM target OR target's public chat.
  const inbox: string[] = [];
  const onMsg = (message: string) => {
    const raw = String(message);
    const low = raw.toLowerCase();

    // --- Match Results detection (the reliable death/leave signal) ---
    // e.g. "🏆 Winner: mxtzzee_  ▏  ☠ Loser: karam_4"
    if (low.includes("winner:") && low.includes("loser:")) {
      const winMatch = raw.match(/winner\s*:\s*([A-Za-z0-9_]+)/i);
      const loseMatch = raw.match(/loser\s*:\s*([A-Za-z0-9_]+)/i);
      const winner = winMatch?.[1]?.toLowerCase();
      const loser = loseMatch?.[1]?.toLowerCase();
      if (loser === self.toLowerCase()) {
        // We lost the duel → we were killed.
        died = true;
        log(rt, "system", "🔆 Beam: match results show I was killed.");
      } else if (winner === self.toLowerCase()) {
        // Opponent lost → they died/left.
        log(rt, "system", "🔆 Beam: match results show opponent died/left.");
        // If the opponent was our target, treat them as gone.
        if (loser && loser === target.toLowerCase()) targetLeft = true;
      }
      return;
    }

    // "X was killed by Y" style lines.
    const killMatch = raw.match(
      /([A-Za-z0-9_]+)\s+was killed by\s+([A-Za-z0-9_]+)/i,
    );
    if (killMatch) {
      const victim = killMatch[1].toLowerCase();
      if (victim === self.toLowerCase()) {
        died = true;
        log(rt, "system", "🔆 Beam: I was killed.");
        return;
      }
      if (victim === target.toLowerCase()) {
        targetLeft = true;
        return;
      }
    }

    // Leave / disconnect detection.
    if (
      low.includes(target.toLowerCase()) &&
      (low.includes("disconnected") || low.includes("left the game"))
    ) {
      targetLeft = true;
      return;
    }

    // Whisper from the target (private).
    const whisper = parseWhisperFrom(raw, target);
    if (whisper) {
      inbox.push(whisper);
      return;
    }
    // Public chat from the target (e.g. "Kotofey52: no bro").
    const pub = parsePublicChatFrom(raw, target);
    if (pub) {
      inbox.push(pub);
    }
  };
  bot.on("messagestr", onMsg);

  const history: { who: "me" | "them"; text: string }[] = [];

  const whisper = async (line: string, gap = SEND_GAP) => {
    try {
      bot.chat(`/msg ${target} ${line}`);
      log(rt, "chat", `<you → ${target}> ${line}`);
      history.push({ who: "me", text: line });
    } catch {
      // ignore
    }
    // Human-like variance so message timing never looks robotic.
    await sleep(humanGap(gap, 0.22));
  };

  // Send a reply as SEPARATE human-style messages instead of one big dump.
  // Splits on sentence breaks / " and " / " cuz " etc so it reads like a real
  // person typing a few short lines.
  const whisperHuman = async (text: string, gap = SEND_GAP) => {
    const clean = text.trim();
    if (!clean) return;
    // Break into natural chunks.
    let parts = clean
      .split(/(?<=[.!?])\s+|\s*[\n;]+\s+|\s+\b(?:and then|then)\b\s+/i)
      .map((p) => p.replace(/^[,.\s]+|[,.\s]+$/g, "").trim())
      .filter((p) => p.length > 0);
    // If still one long run-on, split on " cuz "/" cause "/" and ".
    if (parts.length === 1 && clean.length > 60) {
      parts = clean
        .split(/\s+\b(?:cuz|cause|because|and)\b\s+/i)
        .map((p) => p.trim())
        .filter(Boolean);
    }
    if (parts.length === 0) parts = [clean];
    // Cap to 3 messages so it never spams.
    parts = parts.slice(0, 3);
    for (let i = 0; i < parts.length; i++) {
      if (!rt.beamLoop) return;
      await whisper(parts[i], i === parts.length - 1 ? gap : humanGap(1300, 0.3));
    }
  };

  // Persistent cursor of how many inbox messages we've already consumed.
  // This ensures replies that arrive DURING the opener (before we start
  // waiting) are not skipped — they get picked up on the next read.
  let consumed = 0;

    // Interruptible gap: wait up to `ms`, but return early the moment a new
    // reply arrives. Returns true if a reply is now pending.
    const gapOrReply = async (ms: number): Promise<boolean> => {
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (!rt.beamLoop || died) return inbox.length > consumed;
        if (inbox.length > consumed) {
          await sleep(500); // settle for follow-up lines
          return true;
        }
        await sleep(150);
      }
      return inbox.length > consumed;
    };

    const doLeave = (why: string) => {
      log(rt, "system", `🔆 Beam: ${why} → /leave.`);
      try {
        bot.chat("/leave");
        log(rt, "chat", "<you → server> /leave");
      } catch {
        // ignore
      }
    };

    // After they agree: send a short opener about gamemode, then JUST KEEP
    // CHATTING with them — no auto-leave on silence. We only leave if they
    // hard-refuse. We patiently wait for their replies (humans take time).
    const runClosing = async (): Promise<
      "positive" | "died" | "stopped"
    > => {
      rt.beamStage = "positive → chatting";
      log(rt, "system", "🔆 Beam: positive! They're in — keeping the convo going.");
      // One short, human line. (Not an info-dump.)
      await whisper("ayy lets go, what gamemode u good at?");
      if (died) return "died";
      if (!rt.beamLoop) return "stopped";

      const MAX_WAIT = 600000; // 10 min hard safety cap only
      const startedAt = Date.now();
      while (rt.beamLoop && !died && !targetLeft) {
        if (Date.now() - startedAt > MAX_WAIT) break;
        // Wait patiently for their reply — NO leave on silence here.
        await gapOrReply(60000);
        if (died) return "died";
        if (!rt.beamLoop) return "stopped";
        if (targetLeft) break;
        if (inbox.length <= consumed) continue; // still no reply → keep waiting

        const r = inbox.slice(consumed).join(" ");
        consumed = inbox.length;
        history.push({ who: "them", text: r });
        log(rt, "system", `🔆 Beam: ${target} said "${r.slice(0, 60)}"`);

        const lr = r.toLowerCase();
        const hardNo =
          /\b(no thanks|nty|nvm|never ?mind|not interested|stop|go away|leave me|fuck off|piss off)\b/.test(
            lr,
          );
        if (hardNo) {
          doLeave("they declined");
          break;
        }

        // Let the AI carry the conversation naturally (split into human msgs).
        const ai2 = await aiConverse(channel, self, history, r, serverIp);
        if (ai2.intent === "negative") {
          doLeave("they declined");
          break;
        }
        if (ai2.reply) await whisperHuman(ai2.reply);
      }
      log(
        rt,
        "system",
        targetLeft
          ? `🔆 Beam: ${target} left → restarting.`
          : "🔆 Beam: done with this convo → restarting.",
      );
      return "positive";
    };

    // Process whatever the target just said. Returns next action.
    const handleReply = async (): Promise<
      "negative" | "positive" | "continue" | "died" | "stopped"
    > => {
      if (inbox.length <= consumed) return "continue";
      const reply = inbox.slice(consumed).join(" ");
      consumed = inbox.length;
      history.push({ who: "them", text: reply });
      log(rt, "system", `🔆 Beam: ${target} said "${reply.slice(0, 60)}"`);

      const ai = await aiConverse(channel, self, history, reply, serverIp);
      log(rt, "system", `🔆 Beam: intent=${ai.intent.toUpperCase()}.`);

      if (ai.intent === "negative") {
        doLeave("declined");
        return "negative";
      }
      if (ai.intent === "positive") {
        return await runClosing();
      }
      // question / neutral → reply in-character (split into human messages).
      if (ai.reply) await whisperHuman(ai.reply);
      else if (ai.intent === "question") await whisper(`its ${channel}`);
      if (died) return "died";
      if (!rt.beamLoop) return "stopped";
      return "continue";
    };

    const settle = (o: string): "negative" | "positive" | "died" | "stopped" =>
      o as "negative" | "positive" | "died" | "stopped";

  let outcome: "positive" | "negative" | "died" | "noplayer" | "stopped" =
    "stopped";
  try {
    outcome = await (async (): Promise<
      "positive" | "negative" | "died" | "stopped"
    > => {
    // Opener — send each line, then an interruptible gap. If the target
    // replies at ANY point (during a gap or right after), handle it now.
    rt.beamStage = `messaging ${target}`;

    await whisper("hi", 0);
    if (await gapOrReply(1000)) {
      const o = await handleReply();
      if (o !== "continue") return settle(o);
    } else if (died) return "died";
    else if (!rt.beamLoop) return "stopped";

    if (inbox.length <= consumed) {
      await whisper("can u help me film a yt video", 0);
      if (await gapOrReply(3000)) {
        const o = await handleReply();
        if (o !== "continue") return settle(o);
      } else if (died) return "died";
      else if (!rt.beamLoop) return "stopped";
    }

    if (inbox.length <= consumed) {
      await whisper(
        "Cuz i got a challenge of a 2v2 if we win we will get a rankup",
        0,
      );
      if (await gapOrReply(2600)) {
        const o = await handleReply();
        if (o !== "continue") return settle(o);
      } else if (died) return "died";
      else if (!rt.beamLoop) return "stopped";
    }

    // Ongoing conversation loop (before they've agreed).
    // Wait 10s LONGER than before (30s) so slow repliers aren't dropped.
    let turns = 0;
    while (rt.beamLoop && !died && turns < 10) {
      turns++;
      rt.beamStage = `waiting for ${target}…`;
      const got = await gapOrReply(30000);
      if (died) return "died";
      if (!rt.beamLoop) return "stopped";
      if (!got) {
        await sleep(1500);
        doLeave("no reply");
        await sleep(500);
        return "negative";
      }
      const o = await handleReply();
      if (o !== "continue") return settle(o);
    }
    return died ? "died" : "negative";
    })();
    return outcome;
  } finally {
    bot.removeListener("messagestr", onMsg);
    bot.removeListener("death", onDeath);
    bot.removeListener("playerLeft", onPlayerLeft);
    try {
      bot.setControlState("forward", false);
    } catch {
      // ignore
    }
    // Save the conversation for AI training/analysis (best effort).
    try {
      const { recordConversation } = await import("@/lib/training");
      void recordConversation({
        botId: rt.id,
        target,
        outcome,
        transcript: history,
      });
    } catch {
      // ignore
    }
  }
}

// Start the beam LOOP: keeps recruiting (restarting on deny/death) until stopped.
export async function startBeam(id: string): Promise<BotActionResult> {
  const rt = runtimes.get(id);
  if (!rt || !rt.bot || rt.status !== "online") {
    return { ok: false, message: "Bot must be online and in-game to beam" };
  }
  if (rt.beamLoop) {
    return { ok: false, message: "Beam already running" };
  }

  // Read the YT channel + beam IP from the DB record.
  let channel = "Alight.z";
  let serverIp = "badlion-pvp.xyz";
  try {
    const [rec] = await db.select().from(bots).where(eq(bots.id, id));
    if (rec?.ytChannel) channel = rec.ytChannel;
    if (rec?.beamIp) serverIp = rec.beamIp;
  } catch {
    // ignore, use default
  }

  rt.beamLoop = true;
  rt.beaming = true;
  rt.beamStage = "starting";
  log(rt, "system", `🔆 Beam loop started (channel: ${channel}).`);

  (async () => {
    try {
      while (rt.beamLoop && rt.bot && rt.status === "online") {
        const outcome = await runBeamOnce(rt, channel, serverIp);
        if (!rt.beamLoop) break;
        if (outcome === "stopped") break;
        if (outcome === "positive") {
          // Recruited someone — keep looping to the next player after a pause.
          log(rt, "system", "🔆 Beam: success → next target shortly.");
          rt.beamStage = "cooldown after success";
          await sleep(5000);
        } else {
          // denied / died / no player → wait 5s (let the match results / death
          // sequence settle, avoids targeting color-code junk) then restart.
          log(
            rt,
            "system",
            `🔆 Beam: ${outcome} → restarting beam in 5s.`,
          );
          rt.beamStage = `restarting (${outcome})`;
          await sleep(5000);
        }
      }
    } catch (err) {
      log(
        rt,
        "error",
        "Beam loop error: " +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      rt.beaming = false;
      rt.beamLoop = false;
      rt.beamStage = "";
      try {
        rt.bot?.setControlState("forward", false);
      } catch {
        // ignore
      }
      log(rt, "system", "🔆 Beam loop stopped.");
    }
  })();

  return { ok: true, message: "Beam started" };
}

export async function stopBeam(id: string): Promise<BotActionResult> {
  const rt = runtimes.get(id);
  if (!rt) return { ok: false, message: "Bot not found" };
  if (!rt.beamLoop && !rt.beaming) {
    return { ok: false, message: "Beam is not running" };
  }
  rt.beamLoop = false;
  rt.beamStage = "stopping…";
  log(rt, "system", "🔆 Beam: stop requested.");
  try {
    rt.bot?.setControlState("forward", false);
  } catch {
    // ignore
  }
  return { ok: true, message: "Beam stopping" };
}
