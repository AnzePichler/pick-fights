import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

export const getLiveStatus = unstable_cache(async () => {
  const event = await prisma.event.findFirst({
    where: { isActive: true, slug: { not: "ufc-test" } },
    orderBy: { startsAt: "desc" },
    select: { id: true, startsAt: true, status: true, resultVersion: true, syncEnabled: true, lastSyncAt: true, lastResultAt: true, lastSyncError: true },
  });
  return event ? {
    eventId: event.id, version: event.resultVersion, startsAt: event.startsAt.toISOString(),
    lastSyncAt: event.lastSyncAt?.toISOString() ?? null, lastResultAt: event.lastResultAt?.toISOString() ?? null,
    enabled: event.syncEnabled, needsReview: Boolean(event.lastSyncError), completed: event.status === "COMPLETED",
  } : null;
}, ["live-result-status"], { revalidate: 15, tags: ["leaderboards"] });
