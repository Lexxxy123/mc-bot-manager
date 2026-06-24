import { db } from "@/db";
import { appSettings, beamConversations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

const TRAINING_KEY = "ai_training";
const LEARNINGS_KEY = "ai_learnings";

// In-memory cache so aiConverse doesn't hit the DB on every message.
let cache: { training: boolean; learnings: string; at: number } = {
  training: false,
  learnings: "",
  at: 0,
};

export async function getSetting(key: string): Promise<string> {
  try {
    const [row] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key));
    return row?.value ?? "";
  } catch {
    return "";
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key));
    if (existing.length > 0) {
      await db
        .update(appSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({ key, value });
    }
    cache.at = 0; // invalidate cache
  } catch {
    // ignore
  }
}

export async function getTrainingState(): Promise<{
  training: boolean;
  learnings: string;
}> {
  const now = Date.now();
  if (now - cache.at < 15000) {
    return { training: cache.training, learnings: cache.learnings };
  }
  const [t, l] = await Promise.all([
    getSetting(TRAINING_KEY),
    getSetting(LEARNINGS_KEY),
  ]);
  cache = { training: t === "true", learnings: l, at: now };
  return { training: cache.training, learnings: cache.learnings };
}

export async function setTraining(on: boolean): Promise<void> {
  await setSetting(TRAINING_KEY, on ? "true" : "false");
}

export async function getLearnings(): Promise<string> {
  return getSetting(LEARNINGS_KEY);
}

export async function setLearnings(text: string): Promise<void> {
  await setSetting(LEARNINGS_KEY, text.slice(0, 4000));
}

export async function recordConversation(opts: {
  botId: string | null;
  target: string | null;
  outcome: string;
  transcript: { who: "me" | "them"; text: string }[];
}): Promise<void> {
  // Only store meaningful conversations (the player actually replied).
  if (!opts.transcript.some((t) => t.who === "them")) return;
  try {
    await db.insert(beamConversations).values({
      botId: opts.botId,
      target: opts.target,
      outcome: opts.outcome,
      transcript: JSON.stringify(opts.transcript).slice(0, 8000),
    });
  } catch {
    // ignore
  }
}

export async function listConversations(limit = 50) {
  try {
    return await db
      .select()
      .from(beamConversations)
      .orderBy(desc(beamConversations.createdAt))
      .limit(limit);
  } catch {
    return [];
  }
}

export async function clearConversations(): Promise<void> {
  try {
    await db.delete(beamConversations);
  } catch {
    // ignore
  }
}

// Analyze recent conversations with the AI and distill concise tips that get
// appended to the learnings, which are then injected into future beam prompts.
const POLL_KEY =
  process.env.POLLINATIONS_API_KEY || "sk_PpVAtAY5ACUBJJAhQm5LIG2vNutlowEb";
const POLL_MODEL = process.env.POLLINATIONS_MODEL || "openai";

export async function analyzeAndImprove(): Promise<{
  ok: boolean;
  learnings: string;
  analyzed: number;
}> {
  const convos = await listConversations(40);
  if (convos.length === 0) {
    return { ok: false, learnings: await getLearnings(), analyzed: 0 };
  }

  const transcriptText = convos
    .map((c, i) => {
      let lines: { who: string; text: string }[] = [];
      try {
        lines = JSON.parse(c.transcript);
      } catch {
        lines = [];
      }
      const body = lines
        .map((l) => `${l.who === "me" ? "BOT" : "PLAYER"}: ${l.text}`)
        .join("\n");
      return `--- convo ${i + 1} (outcome: ${c.outcome}) ---\n${body}`;
    })
    .join("\n\n")
    .slice(0, 6000);

  const prev = await getLearnings();

  const prompt =
    `You are improving a Minecraft chat bot that recruits players to team up for a 2v2 YouTube video. ` +
    `Below are real past conversations with their outcomes (positive = player agreed, negative = declined, died/positive etc). ` +
    `Analyze what wording WORKED (led to positive) and what FAILED, and write a concise, updated list of chat guidelines the bot should follow to sound natural and convert more players. ` +
    `Keep it under 18 short bullet points, lowercase casual mc-style advice. Output ONLY the bullet list, no preamble.\n\n` +
    (prev ? `current guidelines:\n${prev}\n\n` : "") +
    `past conversations:\n${transcriptText}`;

  try {
    const url = `https://gen.pollinations.ai/text/${encodeURIComponent(
      prompt,
    )}?model=${encodeURIComponent(POLL_MODEL)}&key=${encodeURIComponent(
      POLL_KEY,
    )}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text.length > 10) {
        await setLearnings(text);
        return { ok: true, learnings: text, analyzed: convos.length };
      }
    }
  } catch {
    // ignore
  }
  return { ok: false, learnings: prev, analyzed: convos.length };
}
