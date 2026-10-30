import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncEvent } from "@/lib/result-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

async function dispatch(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !process.env.UFCALENDAR_API_KEY) return NextResponse.json({ error: "Result sync is not configured." }, { status: 503 });
  const actual = createHash("sha256").update(request.headers.get("authorization") ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  if (!timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const now = new Date();
  const events = await prisma.event.findMany({
    where: { syncEnabled: true, slug: { not: "ufc-test" }, startsAt: { lte: now }, nextSyncAt: { lte: now }, OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lte: now } }] },
    select: { id: true }, orderBy: { nextSyncAt: "asc" }, take: 1,
  });
  const outcomes = [];
  for (const event of events) {
    const outcome = await syncEvent(event.id);
    if (outcome.changed) revalidateTag("leaderboards", { expire: 0 });
    outcomes.push(outcome);
  }
  return NextResponse.json({ outcomes }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = dispatch;
export const POST = dispatch;
