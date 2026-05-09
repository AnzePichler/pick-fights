// app/test-event/leaderboard/page.tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";

export const dynamic = "force-dynamic";

type LeaderboardRow = {
  userId: string;
  position: number;
  name: string;
  username: string;
  imageUrl: string | null;
  correct: number;
  totalPicked: number;
  correctPercentage: number;
  points: number;
};

export default async function TestEventLeaderboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const event = await prisma.event.findUnique({
    where: {
      slug: "ufc-test",
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!event) {
    return (
      <>
        <Navbar />

        <main className="min-h-screen bg-zinc-100 p-6 text-black">
          <section className="mx-auto max-w-5xl rounded-3xl bg-white p-8 shadow-sm">
            <h1 className="text-3xl font-black">No test event found.</h1>
          </section>
        </main>
      </>
    );
  }

  const rows = await getTestLeaderboardRows(event.id);

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-zinc-100 p-6 text-black">
        <section className="mx-auto max-w-5xl">
          <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
            <div className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-black uppercase tracking-widest text-yellow-700">
              Test leaderboard
            </div>

            <h1 className="mt-3 text-4xl font-black tracking-tight">
              {event.name}
            </h1>

            <p className="mt-2 text-sm font-semibold text-neutral-500">
              Dummy scoring based on test results.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="/test-event"
                className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-black text-neutral-700"
              >
                Test picks
              </a>

              <a
                href="/test-event/admin"
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-black text-white"
              >
                Test admin
              </a>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
              <h2 className="text-2xl font-black">No test picks yet.</h2>
              <p className="mt-2 text-sm font-semibold text-neutral-500">
                Submit picks on /test-event first.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {rows.map((row) => (
                <div
                  key={row.userId}
                  className="rounded-3xl bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 text-base font-black text-neutral-700">
                        #{row.position}
                      </div>

                      <Avatar imageUrl={row.imageUrl} name={row.name} />

                      <div className="min-w-0">
                        <div className="truncate text-lg font-black text-neutral-800">
                          {row.name}
                        </div>

                        <div className="truncate text-sm font-semibold text-neutral-400">
                          @{row.username}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-2xl font-black text-blue-600">
                        {row.points}
                      </div>
                      <div className="text-xs font-black uppercase tracking-wider text-neutral-400">
                        points
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-neutral-50 p-4">
                      <div className="text-xs font-black uppercase tracking-wider text-neutral-400">
                        Correct
                      </div>

                      <div className="mt-1 text-xl font-black text-neutral-800">
                        {row.correct}
                        <span className="text-sm font-bold text-neutral-400">
                          {" "}
                          / {row.totalPicked}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-neutral-50 p-4">
                      <div className="text-xs font-black uppercase tracking-wider text-neutral-400">
                        Accuracy
                      </div>

                      <div className="mt-1 text-xl font-black text-neutral-800">
                        {row.correctPercentage}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

async function getTestLeaderboardRows(
  eventId: string,
): Promise<LeaderboardRow[]> {
  const submissions = await prisma.pickSubmission.findMany({
    where: {
      eventId,
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
      choices: {
        include: {
          fight: {
            include: {
              result: true,
            },
          },
        },
      },
    },
  });

  const rows = submissions.map((submission) => {
    let correct = 0;
    let points = 0;

    for (const choice of submission.choices) {
      const result = choice.fight.result;

      const isCorrect =
        result?.status === "WINNER" &&
        result.winnerFighterId === choice.pickedFighterId;

      if (isCorrect) {
        correct += 1;
        points += 100;
      }
    }

    const totalPicked = submission.choices.length;

    return {
      userId: submission.user.id,
      position: 0,
      name: submission.user.displayName || submission.user.username,
      username: submission.user.username,
      imageUrl: submission.user.imageUrl,
      correct,
      totalPicked,
      correctPercentage:
        totalPicked === 0 ? 0 : Math.round((correct / totalPicked) * 1000) / 10,
      points,
    };
  });

  return rows
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.correct !== a.correct) return b.correct - a.correct;
      return a.name.localeCompare(b.name);
    })
    .map((row, index) => ({
      ...row,
      position: index + 1,
    }));
}

function Avatar({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  if (imageUrl) {
    return (
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-200">
        <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-300 text-sm font-black text-neutral-700">
      {getInitials(name)}
    </span>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
