// app/test-event/page.tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import FightAccordion from "@/components/picks/FightAccordion";
import Navbar from "@/components/Navbar";
import type { PickDraft } from "@/types/types";

export const dynamic = "force-dynamic";

const TEST_EVENT_SLUG = "ufc-fight-night-may-30-2026";

type PageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

type CommunityPickUser = {
  id: string;
  name: string;
  imageUrl: string | null;
  isYou: boolean;
};

type FightCommunityPicks = {
  fighterA: CommunityPickUser[];
  fighterB: CommunityPickUser[];
};

export default async function TestEventPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const requestedView = params?.view === "others" ? "others" : "mine";

  const event = await prisma.event.findUnique({
    where: {
      slug: TEST_EVENT_SLUG,
    },
    include: {
      fights: {
        where: {
          status: "ACTIVE",
        },
        include: {
          fighterA: true,
          fighterB: true,
          result: {
            select: {
              status: true,
              winnerFighterId: true,
              method: true,
              round: true,
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
            <h1 className="text-3xl font-black">No test event found.</h1>
            <p className="mt-2 text-neutral-500">
              Create an event in Prisma Studio with slug{" "}
              <span className="font-black">{TEST_EVENT_SLUG}</span>, status{" "}
              <span className="font-black">DRAFT</span>, and isActive{" "}
              <span className="font-black">false</span>.
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
        method: choice.pickedMethod ?? undefined,
        round: choice.pickedRound ?? undefined,
      };
    }
  }

  const activeFightIds = new Set(event.fights.map((fight) => fight.id));

  const activeInitialPicks: Record<string, PickDraft> = {};

  for (const [fightId, pick] of Object.entries(initialPicks)) {
    if (activeFightIds.has(fightId)) {
      activeInitialPicks[fightId] = pick;
    }
  }

  const missingFightIds = event.fights
    .filter((fight) => !activeInitialPicks[fight.id])
    .map((fight) => fight.id);

  const hasExistingSubmission = Boolean(existingSubmission);
  const allActivePicksMade = missingFightIds.length === 0;

  const isTestDraftEvent =
    event.slug === TEST_EVENT_SLUG && event.status === "DRAFT";

  const now = new Date();

  const picksAreClosedByEvent =
    !isTestDraftEvent &&
    (event.status !== "OPEN" || event.lockAt.getTime() <= now.getTime());

  const picksAreLocked =
    picksAreClosedByEvent || (hasExistingSubmission && allActivePicksMade);

  const canViewOthers = hasExistingSubmission && allActivePicksMade;
  const view = canViewOthers ? requestedView : "mine";

  const editableFightIds = picksAreClosedByEvent
    ? []
    : hasExistingSubmission
      ? missingFightIds
      : event.fights.map((fight) => fight.id);

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
            <div className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-black uppercase tracking-widest text-yellow-700">
              Test event
            </div>

            <h1 className="mt-3 text-3xl font-black">{event.name}</h1>

            {view === "others" ? (
              <p className="mt-2 text-sm font-semibold text-neutral-500">
                Everyone&apos;s submitted picks for this dummy event.
              </p>
            ) : hasExistingSubmission &&
              missingFightIds.length > 0 &&
              !picksAreClosedByEvent ? (
              <p className="mt-2 text-sm font-semibold text-orange-600">
                The test card changed. You have {missingFightIds.length} new{" "}
                {missingFightIds.length === 1 ? "pick" : "picks"} to make.
              </p>
            ) : hasExistingSubmission &&
              missingFightIds.length > 0 &&
              picksAreClosedByEvent ? (
              <p className="mt-2 text-sm font-semibold text-neutral-500">
                The test card changed, but picks are closed.
              </p>
            ) : existingSubmission ? (
              <p className="mt-2 text-sm font-semibold text-neutral-500">
                Your dummy picks are submitted and locked. Add a new ACTIVE
                fight in Prisma Studio to test missing picks.
              </p>
            ) : picksAreLocked ? (
              <p className="mt-2 text-sm font-semibold text-neutral-500">
                Picks are closed for this test event.
              </p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-neutral-500">
                Submit picks here, then add a new ACTIVE fight in Prisma Studio
                to test card changes.
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="/test-event/admin"
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-black text-white"
              >
                Test admin results
              </a>

              <a
                href="/test-event/leaderboard"
                className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-black text-neutral-700"
              >
                Test leaderboard
              </a>
            </div>
          </div>

          <FightAccordion
            eventId={event.id}
            fights={event.fights}
            initialPicks={activeInitialPicks}
            editableFightIds={editableFightIds}
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
