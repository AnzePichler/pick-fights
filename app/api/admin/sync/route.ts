import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ResultError, withEventLock } from "@/lib/results";
import { syncEvent } from "@/lib/result-sync";
import { fetchProviderEvent, normalizedName, ProviderError } from "@/lib/ufcalendar";

const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("disable"), eventId: z.string().min(1) }),
  z.object({ action: z.literal("sync"), eventId: z.string().min(1) }),
  z.object({ action: z.literal("release"), eventId: z.string().min(1), fightId: z.string().min(1) }),
  z.object({ action: z.literal("protect"), eventId: z.string().min(1), fightId: z.string().min(1) }),
  z.object({ action: z.literal("configure"), eventId: z.string().min(1), providerEventId: z.string().regex(/^[a-zA-Z0-9-]{1,120}$/),
    mappings: z.array(z.object({ fightId: z.string().min(1), providerFightId: z.string().regex(/^\d+$/), swap: z.boolean() })).min(1).max(50) }),
]);

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const params = new URL(request.url).searchParams;
    const event = await prisma.event.findUnique({ where: { id: params.get("eventId") ?? "" }, select: {
      id: true, startsAt: true, slug: true, fights: { where: { status: "ACTIVE" }, select: { id: true, providerFightId: true, fighterA: { select: { name: true } }, fighterB: { select: { name: true } } } },
    } });
    if (!event || event.slug === "ufc-test") return NextResponse.json({ error: "Live event not found." }, { status: 404 });
    const provider = await fetchProviderEvent(params.get("providerEventId") ?? "");
    const suggestions = event.fights.map((fight) => {
      const localA = normalizedName(fight.fighterA.name);
      const localB = normalizedName(fight.fighterB.name);
      const matches = provider.card.filter((remote) => {
        const names = [normalizedName(remote.fighter_a?.name ?? ""), normalizedName(remote.fighter_b?.name ?? "")];
        return localA !== localB && names.includes(localA) && names.includes(localB);
      });
      const remote = matches.length === 1 ? matches[0] : null;
      return { fightId: fight.id, providerFightId: remote?.id ?? "", swap: remote ? normalizedName(remote.fighter_a?.name ?? "") !== localA : false };
    });
    return NextResponse.json({ provider, suggestions, timingWarning: Math.abs(new Date(provider.starts_at).getTime() - event.startsAt.getTime()) > 60_000 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ProviderError ? error.message : "Unable to preview the event." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const parsed = command.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid sync configuration." }, { status: 400 });
    const input = parsed.data;
    if (input.action === "sync") {
      const outcome = await syncEvent(input.eventId, true);
      if (outcome.changed) revalidateTag("leaderboards", { expire: 0 });
      return NextResponse.json(outcome);
    }
    const provider = input.action === "configure" ? await fetchProviderEvent(input.providerEventId) : null;
    await withEventLock(prisma, input.eventId, async (transaction) => {
      const event = await transaction.event.findUniqueOrThrow({ where: { id: input.eventId }, include: { fights: true } });
      if (event.slug === "ufc-test") throw new ResultError("Test events cannot use live sync.");
      if (input.action === "disable") {
        await transaction.event.update({ where: { id: event.id }, data: { syncEnabled: false, nextSyncAt: null, syncLeaseUntil: null, syncLeaseToken: null } });
        return;
      }
      if (input.action === "release" || input.action === "protect") {
        if (!event.fights.some((fight) => fight.id === input.fightId)) throw new ResultError("Fight does not belong to this event.");
        const source = input.action === "protect" ? "MANUAL" : "UFCALENDAR";
        await transaction.fightResult.upsert({ where: { fightId: input.fightId }, create: { fightId: input.fightId, status: "PENDING", source }, update: { source } });
        await transaction.fightResultChange.create({ data: { fightId: input.fightId, source, snapshot: { action: input.action === "protect" ? "manual_override_protected" : "manual_override_released" } } });
        return;
      }
      if (!provider) throw new ResultError("Preview the provider card first.");
      if (event.status === "DRAFT") throw new ResultError("Publish the event before enabling result sync.");
      if (event.lockAt > event.startsAt) throw new ResultError("Pick deadline must be at or before event start. Correct event timing before enabling sync.");
      const activeFights = event.fights.filter((fight) => fight.status === "ACTIVE");
      if (input.mappings.length !== activeFights.length || new Set(input.mappings.map((mapping) => mapping.fightId)).size !== activeFights.length || new Set(input.mappings.map((mapping) => mapping.providerFightId)).size !== input.mappings.length) throw new ResultError("Map every active fight exactly once.");
      const mappedIds = new Set(input.mappings.map((mapping) => mapping.providerFightId));
      if (provider.card.some((fight) => fight.status !== "cancelled" && !mappedIds.has(fight.id))) throw new ResultError("The provider has additional bouts. Update the local card before enabling sync.");
      await transaction.fight.updateMany({ where: { eventId: event.id }, data: { providerFightId: null, providerFighterAId: null, providerFighterBId: null } });
      for (const mapping of input.mappings) {
        if (!activeFights.some((fight) => fight.id === mapping.fightId)) throw new ResultError("Mapping is for an inactive or unrelated fight.");
        const remote = provider.card.find((fight) => fight.id === mapping.providerFightId);
        if (!remote || (remote.status !== "cancelled" && (!remote.fighter_a || !remote.fighter_b))) throw new ResultError("Provider fight or corners are missing.");
        await transaction.fight.update({ where: { id: mapping.fightId }, data: {
          providerFightId: remote.id,
          providerFighterAId: (mapping.swap ? remote.fighter_b : remote.fighter_a)?.id ?? null,
          providerFighterBId: (mapping.swap ? remote.fighter_a : remote.fighter_b)?.id ?? null,
        } });
      }
      await transaction.event.update({ where: { id: event.id }, data: {
        providerEventId: provider.id, syncEnabled: true, nextSyncAt: event.startsAt > new Date() ? event.startsAt : new Date(),
        syncFailures: 0, lastSyncError: null, syncFinishedAt: null, syncLeaseUntil: null, syncLeaseToken: null,
      } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ProviderError || error instanceof ResultError || error instanceof SyntaxError) return NextResponse.json({ error: error instanceof SyntaxError ? "Invalid JSON." : error.message }, { status: 400 });
    return NextResponse.json({ error: "Sync configuration failed. Check event/fight mappings for conflicts." }, { status: 400 });
  }
}
