import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { applyResults, recalculateEventScores, withEventLock, type ResultUpdate } from "./results";
import { fetchProviderEvent, normalizeProviderResult, ProviderError } from "./ufcalendar";

export const SYNC_INTERVAL_MS = 6 * 60_000;
const LEASE_MS = 2 * 60_000;
const MAX_EVENT_MS = 18 * 60 * 60_000;
const RECONCILE_MS = 12 * 60 * 60_000;

export function getNextSyncSlot(now = new Date()) {
  return new Date((Math.floor(now.getTime() / SYNC_INTERVAL_MS) + 1) * SYNC_INTERVAL_MS);
}

export async function syncEvent(eventId: string, force = false) {
  const now = new Date();
  const token = randomUUID();
  const claimed = await prisma.event.updateMany({
    where: {
      id: eventId, syncEnabled: true, slug: { not: "ufc-test" }, startsAt: { lte: now },
      ...(force ? {} : { nextSyncAt: { lte: now } }),
      OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lte: now } }],
    },
    data: { syncLeaseUntil: new Date(now.getTime() + LEASE_MS), syncLeaseToken: token },
  });
  if (!claimed.count) return { eventId, state: "skipped" as const, changed: false };
  try {
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    if (event.status === "DRAFT") throw new ProviderError("Publish the event before enabling result sync.");
    if (event.lockAt > event.startsAt || event.lockAt > now) throw new ProviderError("Sync blocked: pick deadline must be at or before the event start. Review event timing without changing submitted picks.");
    if (!event.providerEventId) throw new ProviderError("Map a UFCalendar event before enabling sync.");
    if (!force && !event.syncFinishedAt && now.getTime() - event.startsAt.getTime() > MAX_EVENT_MS) {
      throw new ProviderError("Sync paused: the event started over 18 hours ago. Review missing results or use Sync now.");
    }
    const provider = await fetchProviderEvent(event.providerEventId);
    const outcome = await withEventLock(prisma, eventId, async (transaction) => {
      const current = await transaction.event.findUniqueOrThrow({ where: { id: eventId }, include: { fights: { include: { result: true } } } });
      if (!current.syncEnabled || current.syncLeaseToken !== token) return { eventId, state: "skipped" as const, changed: false };
      if (provider.id !== current.providerEventId) throw new ProviderError("Provider event identity changed; review the mapping.");
      if (current.lockAt > current.startsAt || current.lockAt > new Date()) throw new ProviderError("Sync blocked: picks are still open. Review event timing.");
      const locked = current.status === "OPEN";
      if (locked) await transaction.event.update({ where: { id: eventId }, data: { status: "LOCKED" } });
      const warnings: string[] = [];
      const updates: ResultUpdate[] = [];
      const activeFights = current.fights.filter((fight) => fight.status === "ACTIVE");
      const mappedIds = new Set(activeFights.map((fight) => fight.providerFightId));
      if (provider.card.some((fight) => fight.status !== "cancelled" && !mappedIds.has(fight.id))) warnings.push("The provider card has unmapped bouts. Review the card mapping.");
      if (provider.status === "postponed" || provider.status === "cancelled") warnings.push("The provider event was postponed or cancelled. Review event timing and picks.");
      for (const fight of activeFights) {
        const remote = provider.card.find((entry) => entry.id === fight.providerFightId);
        if (!remote) { warnings.push(`Fight ${fight.id}: provider mapping is missing.`); continue; }
        const cornerIds = [remote.fighter_a?.id, remote.fighter_b?.id];
        if (remote.status !== "cancelled" && (!fight.providerFighterAId || !fight.providerFighterBId || fight.providerFighterAId === fight.providerFighterBId || !cornerIds.includes(fight.providerFighterAId) || !cornerIds.includes(fight.providerFighterBId))) {
          warnings.push(`Fight ${fight.id}: provider opponents changed. Review the mapping.`);
          continue;
        }
        if (fight.result?.source === "MANUAL") continue;
        try {
          const result = normalizeProviderResult(remote, fight);
          if (result) updates.push(result);
        } catch (error) { warnings.push(error instanceof ProviderError ? error.message : "A result needs manual review."); }
      }
      const updatedResults = new Map(updates.map((result) => [result.fightId, result]));
      const localFinal = activeFights.every((fight) => {
        const result = updatedResults.get(fight.id) ?? fight.result;
        return result && result.status !== "PENDING";
      });
      const liveCard = provider.card.filter((fight) => fight.status !== "cancelled");
      const allRemoteFinal = liveCard.length > 0 && liveCard.every((fight) => fight.status === "completed" || fight.status === "no_contest");
      const headliner = liveCard.find((fight) => fight.is_main) ?? liveCard.find((fight) => fight.ordering === 1);
      const headlinerFinal = headliner?.status === "completed" || headliner?.status === "no_contest";
      const finished = activeFights.length > 0 && localFinal && !warnings.length && allRemoteFinal && (headlinerFinal || provider.status === "completed");
      const result = await applyResults(transaction, eventId, updates, "UFCALENDAR", finished);
      if (locked && !result.changed) {
        await recalculateEventScores(transaction, eventId);
        await transaction.event.update({ where: { id: eventId }, data: { resultVersion: { increment: 1 } } });
      }
      const failures = warnings.length ? current.syncFailures + 1 : 0;
      const done = finished && Boolean(current.syncFinishedAt);
      const delay = warnings.length ? Math.min(SYNC_INTERVAL_MS * 2 ** Math.min(failures - 1, 4), 60 * 60_000) : SYNC_INTERVAL_MS;
      await transaction.event.update({ where: { id: eventId }, data: {
        lastSyncAt: now, lastSyncError: warnings.length ? warnings.slice(0, 8).join(" ") : null,
        syncFailures: failures, syncLeaseUntil: null, syncLeaseToken: null,
        syncFinishedAt: finished ? current.syncFinishedAt ?? now : current.syncFinishedAt,
        nextSyncAt: done ? null : finished || warnings.length
          ? new Date(now.getTime() + (finished ? RECONCILE_MS : delay))
          : getNextSyncSlot(),
        syncEnabled: !done && failures < 12,
      } });
      return { eventId, state: warnings.length ? "needs-review" as const : "synced" as const, changed: result.changed || locked };
    });
    return outcome;
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : "Result sync failed. Check server logs and retry.";
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { syncFailures: true, startsAt: true, syncFinishedAt: true } });
    const failures = (event?.syncFailures ?? 0) + 1;
    const expired = event && !event.syncFinishedAt && now.getTime() - event.startsAt.getTime() > MAX_EVENT_MS;
    const retryAfter = error instanceof ProviderError ? error.retryAfterSeconds * 1000 : 0;
    const delay = Math.max(retryAfter, Math.min(SYNC_INTERVAL_MS * 2 ** Math.min(failures - 1, 4), 60 * 60_000));
    await prisma.event.updateMany({ where: { id: eventId, syncLeaseToken: token }, data: {
      lastSyncError: message, syncFailures: failures, syncLeaseUntil: null, syncLeaseToken: null,
      nextSyncAt: new Date(Date.now() + delay), syncEnabled: !expired && failures < 12,
    } });
    return { eventId, state: "failed" as const, changed: false };
  }
}
