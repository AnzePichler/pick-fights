import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import FantasyLineup from "./FantasyLineup";

export const dynamic = "force-dynamic";

export default async function FantasyPage({ searchParams }: {
  searchParams: Promise<{ event?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { event: eventId } = await searchParams;
  const event = await prisma.event.findFirst({
    where: {
      ...(eventId ? { id: eventId } : { isActive: true }),
      slug: { not: "ufc-test" },
      status: { not: "DRAFT" },
    },
    orderBy: { startsAt: "asc" },
    include: {
      fights: {
        orderBy: { order: "asc" },
        include: { fighterA: true, fighterB: true, result: true },
      },
      fantasyLineups: {
        where: { userId: session.user.id },
        include: { choices: true },
      },
    },
  });

  const entries = await prisma.fantasyLineup.findMany({
    where: { userId: session.user.id, event: { slug: { not: "ufc-test" }, status: { not: "DRAFT" } } },
    orderBy: { event: { startsAt: "desc" } },
    select: { event: { select: { id: true, name: true } } },
  });
  const renderedAt = new Date().getTime();

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-zinc-100 p-6 text-black">
        <section className="mx-auto max-w-5xl">
          {event ? (
            <FantasyLineup key={event.id} event={{ id: event.id, name: event.name, status: event.status, lockAt: event.lockAt.toISOString() }}
              initialNow={renderedAt}
              initialChoices={event.fantasyLineups[0]?.choices ?? []}
              fights={event.fights.map((fight) => ({
                id: fight.id, status: fight.status,
                fighterAId: fight.fighterAId, fighterBId: fight.fighterBId,
                fighterAIsUnderdog: fight.fighterAIsUnderdog, fighterBIsUnderdog: fight.fighterBIsUnderdog,
                result: fight.result ? { status: fight.result.status, winnerFighterId: fight.result.winnerFighterId, method: fight.result.method } : null,
              }))}
              fighters={event.fights.flatMap((fight) => [
                { id: fight.fighterAId, fightId: fight.id, name: fight.fighterA.name, imageUrl: fight.fighterA.imageUrl, opponent: fight.fighterB.name, odds: fight.fighterAOdds, isUnderdog: fight.fighterAIsUnderdog },
                { id: fight.fighterBId, fightId: fight.id, name: fight.fighterB.name, imageUrl: fight.fighterB.imageUrl, opponent: fight.fighterA.name, odds: fight.fighterBOdds, isUnderdog: fight.fighterBIsUnderdog },
              ])} />
          ) : <p className="rounded-3xl bg-white p-6">No playable event found. Your previous lineups are listed below.</p>}
          {entries.length > 0 && (
            <section className="mt-8 rounded-3xl bg-white p-6">
              <h2 className="mb-3 text-lg font-black">Your event lineups</h2>
              <ul className="flex flex-wrap gap-3">
                {entries.map(({ event: entry }) => <li key={entry.id}>
                  <Link href={`/fantasy?event=${entry.id}`} className="font-semibold underline">{entry.name}</Link>
                </li>)}
              </ul>
            </section>
          )}
        </section>
      </main>
    </>
  );
}
