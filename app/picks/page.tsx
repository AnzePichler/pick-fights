// app/picks/page.tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import FightAccordion from "@/components/picks/FightAccordion";
import Navbar from "@/components/Navbar";
import type { PickDraft } from "@/types/types";

export const dynamic = "force-dynamic";

export default async function PicksPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const event = await prisma.event.findFirst({
    where: {
      isActive: true,
    },
    include: {
      fights: {
        include: {
          fighterA: true,
          fighterB: true,
        },
        orderBy: {
          order: "asc",
        },
      },
    },
  });

  if (!event) {
    return (
      <>
        <Navbar />

        <main className="min-h-screen bg-zinc-100 p-6 text-black">
          <section className="mx-auto max-w-5xl rounded-3xl bg-white p-8 shadow-sm">
            <h1 className="text-3xl font-black">No active event yet.</h1>
            <p className="mt-2 text-neutral-500">
              Once an event is active, picks will show up here.
            </p>
          </section>
        </main>
      </>
    );
  }

  const existingSubmission = await prisma.pickSubmission.findUnique({
    where: {
      userId_eventId: {
        userId: session.user.id,
        eventId: event.id,
      },
    },
    include: {
      choices: true,
    },
  });

  const initialPicks: Record<string, PickDraft> = {};

  if (existingSubmission) {
    for (const choice of existingSubmission.choices) {
      initialPicks[choice.fightId] = {
        fighterId: choice.pickedFighterId,
      };
    }
  }

  const now = new Date();

  const picksAreLocked =
    Boolean(existingSubmission) || event.lockAt.getTime() <= now.getTime();

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-zinc-100 p-6 text-black">
        <section className="mx-auto max-w-5xl">
          <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
            <h1 className="text-3xl font-black">{event.name}</h1>

            {existingSubmission ? (
              <p className="mt-2 text-sm font-semibold text-neutral-500">
                Your picks are submitted and locked. You can still open each
                fight to view the details.
              </p>
            ) : picksAreLocked ? (
              <p className="mt-2 text-sm font-semibold text-neutral-500">
                Picks are closed for this event.
              </p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-neutral-500">
                Pick one fighter for every fight. Once submitted, picks are
                locked.
              </p>
            )}
          </div>

          <FightAccordion
            eventId={event.id}
            fights={event.fights}
            initialPicks={initialPicks}
            isLocked={picksAreLocked}
          />
        </section>
      </main>
    </>
  );
}
