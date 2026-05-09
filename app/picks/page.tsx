// app/picks/page.tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import FightAccordion from "@/components/picks/FightAccordion";
import Navbar from "@/components/Navbar";
import type { PickDraft } from "@/types/types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

export type CommunityPickUser = {
  id: string;
  name: string;
  imageUrl: string | null;
  isYou: boolean;
};

export type FightCommunityPicks = {
  fighterA: CommunityPickUser[];
  fighterB: CommunityPickUser[];
};

export default async function PicksPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const requestedView = params?.view === "others" ? "others" : "mine";

  const event = await prisma.event.findFirst({
    where: {
      isActive: true,
    },
    include: {
      fights: {
        include: {
          fighterA: true,
          fighterB: true,
          result: {
            select: {
              status: true,
              winnerFighterId: true,
            },
          },
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
    Boolean(existingSubmission) ||
    event.status !== "OPEN" ||
    event.lockAt.getTime() <= now.getTime();

  const canViewOthers = Boolean(existingSubmission);
  const view = canViewOthers ? requestedView : "mine";

  const communityPicks: Record<string, FightCommunityPicks> = {};

  if (view === "others") {
    for (const fight of event.fights) {
      communityPicks[fight.id] = {
        fighterA: [],
        fighterB: [],
      };
    }

    const allSubmissions = await prisma.pickSubmission.findMany({
      where: {
        eventId: event.id,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            imageUrl: true,
          },
        },
        choices: true,
      },
    });

    const fightMap = new Map(
      event.fights.map((fight) => [
        fight.id,
        {
          fighterAId: fight.fighterA.id,
          fighterBId: fight.fighterB.id,
        },
      ]),
    );

    for (const submission of allSubmissions) {
      const user = {
        id: submission.user.id,
        name: submission.user.displayName || submission.user.username,
        imageUrl: submission.user.imageUrl,
        isYou: submission.user.id === session.user.id,
      };

      for (const choice of submission.choices) {
        const fight = fightMap.get(choice.fightId);
        const bucket = communityPicks[choice.fightId];

        if (!fight || !bucket) continue;

        if (choice.pickedFighterId === fight.fighterAId) {
          bucket.fighterA.push(user);
        }

        if (choice.pickedFighterId === fight.fighterBId) {
          bucket.fighterB.push(user);
        }
      }
    }
  }

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-zinc-100 p-6 text-black">
        <section className="mx-auto max-w-5xl">
          <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
            <h1 className="text-3xl font-black">{event.name}</h1>

            {view === "others" ? (
              <p className="mt-2 text-sm font-semibold text-neutral-500">
                Everyone&apos;s submitted picks for this event.
              </p>
            ) : existingSubmission ? (
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
            view={view}
            canViewOthers={canViewOthers}
            communityPicks={communityPicks}
          />
        </section>
      </main>
    </>
  );
}
