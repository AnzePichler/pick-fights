import { z } from "zod";
import type { ResultUpdate } from "./results";

const providerId = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).transform(String);
const corner = z.object({ id: providerId, name: z.string().min(1) });
export const providerFightSchema = z.object({
  id: providerId,
  status: z.enum(["announced", "confirmed", "cancelled", "completed", "no_contest"]).nullable(),
  ordering: z.number().int().nullable(),
  is_main: z.boolean(),
  fighter_a: corner.nullable(),
  fighter_b: corner.nullable(),
  result: z.object({
    winner_fighter_id: providerId.nullable(),
    method: z.string().nullable(),
    method_normalized: z.string().nullable().optional(),
    round: z.number().int().min(1).max(5).nullable(),
  }).nullable(),
});

export const providerEventSchema = z.object({
  id: providerId,
  title: z.string().min(1),
  org: z.literal("ufc"),
  starts_at: z.string().datetime({ offset: true }),
  status: z.enum(["announced", "scheduled", "live", "completed", "cancelled", "postponed"]),
  card: z.array(providerFightSchema).min(1).max(50),
}).superRefine((event, context) => {
  if (new Set(event.card.map((fight) => fight.id)).size !== event.card.length) {
    context.addIssue({ code: "custom", message: "Duplicate provider fight IDs." });
  }
});

export type ProviderEvent = z.infer<typeof providerEventSchema>;
export type ProviderFight = z.infer<typeof providerFightSchema>;
export type FightMapping = {
  id: string;
  fighterAId: string;
  fighterBId: string;
  providerFighterAId: string | null;
  providerFighterBId: string | null;
};

export class ProviderError extends Error {
  constructor(message: string, public retryAfterSeconds = 0) { super(message); }
}

export async function fetchProviderEvent(eventId: string): Promise<ProviderEvent> {
  const key = process.env.UFCALENDAR_API_KEY;
  if (!key) throw new ProviderError("UFCalendar API key is not configured.");
  if (!/^[a-zA-Z0-9-]{1,120}$/.test(eventId)) throw new ProviderError("Invalid provider event ID or slug.");
  let response: Response;
  try {
    response = await fetch(`https://api.ufcalendar.com/v1/events/${encodeURIComponent(eventId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store", signal: AbortSignal.timeout(10_000), redirect: "error",
    });
  } catch {
    throw new ProviderError("UFCalendar request failed or timed out. Use the canonical numeric event ID if a slug was renamed.");
  }
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfter && /^\d+$/.test(retryAfter)
      ? Number(retryAfter)
      : retryAfter ? Math.max(0, Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000)) : 0;
    throw new ProviderError(`UFCalendar returned HTTP ${response.status}.`, Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 0);
  }
  if (Number(response.headers.get("content-length")) > 2_000_000) throw new ProviderError("UFCalendar response is too large.");
  let parsed: ReturnType<typeof providerEventSchema.safeParse>;
  try {
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error();
    parsed = providerEventSchema.safeParse(JSON.parse(body).data);
  } catch {
    throw new ProviderError("UFCalendar returned invalid JSON.");
  }
  if (!parsed.success) throw new ProviderError("UFCalendar returned an unexpected event format.");
  return parsed.data;
}

export function normalizeProviderResult(fight: ProviderFight, mapping: FightMapping): ResultUpdate | null {
  const empty = { fightId: mapping.id, winnerFighterId: null, method: null, round: null };
  if (fight.status === "cancelled") return { ...empty, status: "CANCELLED" };
  if (fight.status === "no_contest") return { ...empty, status: "NO_CONTEST" };
  if (fight.status !== "completed") return null;
  if (!fight.result) throw new ProviderError(`Fight ${fight.id}: final result is missing.`);
  const normalized = fight.result.method_normalized;
  const rawMethod = fight.result.method?.trim().toLowerCase() ?? "";
  if (normalized === "draw" || /\bdraw\b/.test(rawMethod)) return { ...empty, status: "DRAW" };
  if (normalized === "no_contest" || /no[ -]?contest/.test(rawMethod)) return { ...empty, status: "NO_CONTEST" };
  if (fight.result.winner_fighter_id === null) throw new ProviderError(`Fight ${fight.id}: outcome needs manual review.`);
  const winnerFighterId = fight.result.winner_fighter_id === mapping.providerFighterAId
    ? mapping.fighterAId
    : fight.result.winner_fighter_id === mapping.providerFighterBId ? mapping.fighterBId : null;
  if (!winnerFighterId) throw new ProviderError(`Fight ${fight.id}: winner is outside the mapped corners.`);
  let method: ResultUpdate["method"] = null;
  if (normalized === "ko_tko" || (!normalized && /^(ko\b|tko\b)/.test(rawMethod))) method = "KO_TKO";
  if (["submission", "technical_submission"].includes(normalized ?? "") || (!normalized && /^(technical )?submission\b/.test(rawMethod))) method = "SUBMISSION";
  if (normalized?.startsWith("decision") || (!normalized && /^decision\b/.test(rawMethod))) method = "DECISION";
  if (!method || !fight.result.round) throw new ProviderError(`Fight ${fight.id}: unsupported method or missing round; enter a manual result.`);
  return { fightId: mapping.id, status: "WINNER", winnerFighterId, method, round: fight.result.round };
}

export function normalizedName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
