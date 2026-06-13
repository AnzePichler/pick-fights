// app/my-picks/page.tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import {
  calculatePickPoints,
  getRarityMultiplier,
  isCorrectWinnerPick,
} from "../lib/scoring";

export const dynamic = "force-dynamic";

type PickResultState = "pending" | "correct" | "wrong" | "draw";

export default async function MyPicksPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  console.time("my-picks: submissions query");

  const submissions = await prisma.pickSubmission.findMany({
    where: {
      userId: session.user.id,
      event: {
        slug: {
          not: "ufc-test",
        },
      },
    },
    orderBy: {
      submittedAt: "desc",
    },
    select: {
      id: true,
      submittedAt: true,
      event: {
        select: {
          id: true,
          name: true,
          status: true,
          startsAt: true,
        },
      },
      choices: {
        select: {
          id: true,
          fightId: true,
          pickedFighterId: true,
          pickedMethod: true,
          pickedRound: true,
          fight: {
            select: {
              id: true,
              fighterA: {
                select: {
                  id: true,
                  name: true,
                  imageUrl: true,
                },
              },
              fighterB: {
                select: {
                  id: true,
                  name: true,
                  imageUrl: true,
                },
              },
              result: {
                select: {
                  status: true,
                  winnerFighterId: true,
                  method: true,
                  round: true,
                },
              },
            },
          },
        },
        orderBy: {
          fight: {
            order: "asc",
          },
        },
      },
    },
  });

  console.timeEnd("my-picks: submissions query");

  const eventIds = submissions.map((submission) => submission.event.id);

  console.time("my-picks: cached scores query");

  const cachedScores =
    eventIds.length === 0
      ? []
      : await prisma.userEventScore.findMany({
          where: {
            userId: session.user.id,
            eventId: {
              in: eventIds,
            },
          },
          select: {
            eventId: true,
            totalPicked: true,
            correct: true,
            points: true,
            correctPercentage: true,
          },
        });

  console.timeEnd("my-picks: cached scores query");

  const scoreByEventId = new Map(
    cachedScores.map((score) => [score.eventId, score]),
  );

  console.time("my-picks: all submissions stats query");

  const statChoices =
    eventIds.length === 0
      ? []
      : await prisma.pickChoice.findMany({
          where: {
            submission: {
              eventId: {
                in: eventIds,
              },
            },
          },
          select: {
            fightId: true,
            pickedFighterId: true,
            fight: {
              select: {
                result: {
                  select: {
                    status: true,
                    winnerFighterId: true,
                  },
                },
              },
            },
          },
        });

  console.timeEnd("my-picks: all submissions stats query");
  const fightStats = new Map<
    string,
    {
      totalPickCount: number;
      winnerPickCount: number;
    }
  >();

  for (const choice of statChoices) {
    const result = choice.fight.result;

    if (result?.status !== "WINNER" || !result.winnerFighterId) {
      continue;
    }

    const current = fightStats.get(choice.fightId) || {
      totalPickCount: 0,
      winnerPickCount: 0,
    };

    current.totalPickCount += 1;

    if (choice.pickedFighterId === result.winnerFighterId) {
      current.winnerPickCount += 1;
    }

    fightStats.set(choice.fightId, current);
  }

  console.time("my-picks: build cards");

  const cards = submissions.map((submission) => {
    let liveCorrect = 0;
    let livePoints = 0;

    const picks = submission.choices.map((choice) => {
      const fight = choice.fight;

      const pickedFighter =
        choice.pickedFighterId === fight.fighterA.id
          ? fight.fighterA
          : fight.fighterB;

      const resultState = getPickResultState({
        pickedFighterId: choice.pickedFighterId,
        result: fight.result,
      });

      const isCorrect = isCorrectWinnerPick({
        pickedFighterId: choice.pickedFighterId,
        result: fight.result,
      });

      if (isCorrect) {
        liveCorrect += 1;
      }

      const stats = fightStats.get(choice.fightId) || {
        totalPickCount: 0,
        winnerPickCount: 0,
      };

      const rarityMultiplier = getRarityMultiplier(stats);

      const pickPoints = calculatePickPoints({
        pickedFighterId: choice.pickedFighterId,
        pickedMethod: choice.pickedMethod,
        pickedRound: choice.pickedRound,
        result: fight.result,
        rarityMultiplier,
      });

      const methodState = getMethodPredictionState({
        isCorrectWinner: isCorrect,
        pickedMethod: choice.pickedMethod,
        resultMethod: fight.result?.method ?? null,
        resultStatus: fight.result?.status ?? null,
      });

      const roundState = getRoundPredictionState({
        isCorrectWinner: isCorrect,
        pickedMethod: choice.pickedMethod,
        pickedRound: choice.pickedRound,
        resultMethod: fight.result?.method ?? null,
        resultRound: fight.result?.round ?? null,
        resultStatus: fight.result?.status ?? null,
      });

      livePoints += pickPoints;

      return {
        id: choice.id,
        pickedFighter,
        opponent:
          choice.pickedFighterId === fight.fighterA.id
            ? fight.fighterB
            : fight.fighterA,
        fight,
        resultState,
        points: pickPoints,
        pickedMethod: choice.pickedMethod,
        pickedRound: choice.pickedRound,
        rarityMultiplier,
        winnerPickCount: stats.winnerPickCount,
        totalPickCount: stats.totalPickCount,
        methodState,
        roundState,
      };
    });

    const cachedScore = scoreByEventId.get(submission.event.id);

    const total = cachedScore?.totalPicked ?? submission.choices.length;
    const correct = cachedScore?.correct ?? liveCorrect;
    const points = cachedScore?.points ?? livePoints;
    const correctPercentage =
      cachedScore?.correctPercentage ??
      (total === 0 ? 0 : Math.round((correct / total) * 1000) / 10);

    return {
      submissionId: submission.id,
      event: submission.event,
      submittedAt: submission.submittedAt,
      correct,
      points,
      total,
      correctPercentage,
      picks,
    };
  });

  console.timeEnd("my-picks: build cards");

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-zinc-100 p-6 text-black">
        <section className="mx-auto max-w-5xl">
          <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
            <h1 className="text-4xl font-black tracking-tight">My Picks</h1>

            <p className="mt-2 text-sm font-semibold text-neutral-500">
              Your submitted picks across previous events.
            </p>
          </div>

          {cards.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
              <h2 className="text-2xl font-black">No picks yet.</h2>
              <p className="mt-2 text-sm font-semibold text-neutral-500">
                Once you submit picks for an event, they will show up here.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {cards.map((card) => (
                <details
                  key={card.submissionId}
                  className="group overflow-hidden rounded-3xl bg-white shadow-sm"
                >
                  <summary className="cursor-pointer list-none p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="text-xs font-black uppercase tracking-widest text-neutral-400">
                            {card.event.status}
                          </div>

                          <span className="text-neutral-300 transition group-open:rotate-180">
                            ▼
                          </span>
                        </div>

                        <h2 className="mt-1 truncate text-2xl font-black text-neutral-900 md:text-3xl">
                          {card.event.name}
                        </h2>

                        <p className="mt-1 text-sm font-semibold text-neutral-500">
                          Submitted {formatDate(card.submittedAt)}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <StatBox
                          label="Correct"
                          value={`${card.correct}/${card.total}`}
                        />

                        <StatBox label="Points" value={String(card.points)} />

                        <StatBox
                          label="Accuracy"
                          value={`${formatPercentage(card.correctPercentage)}%`}
                        />
                      </div>
                    </div>
                  </summary>

                  <div className="border-t border-neutral-100">
                    <div className="divide-y divide-neutral-100">
                      {card.picks.map((pick) => (
                        <div
                          key={pick.id}
                          className="flex items-center justify-between gap-4 p-4 md:p-5"
                        >
                          <div className="flex min-w-0 items-center gap-4">
                            <ResultIcon state={pick.resultState} />

                            <FighterAvatar
                              imageUrl={pick.pickedFighter.imageUrl}
                              name={pick.pickedFighter.name}
                            />

                            <div className="min-w-0">
                              <div className="truncate text-base font-black text-neutral-800 md:text-lg">
                                {pick.pickedFighter.name}
                              </div>

                              <PredictionBreakdown
                                pickedMethod={pick.pickedMethod}
                                pickedRound={pick.pickedRound}
                                methodState={pick.methodState}
                                roundState={pick.roundState}
                              />
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <PickPointsBreakdown
                              points={pick.points}
                              rarityMultiplier={pick.rarityMultiplier}
                              winnerPickCount={pick.winnerPickCount}
                              totalPickCount={pick.totalPickCount}
                            />

                            <ResultLabel state={pick.resultState} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function getPickResultState({
  pickedFighterId,
  result,
}: {
  pickedFighterId: string;
  result: {
    status: "PENDING" | "WINNER" | "DRAW" | "NO_CONTEST" | "CANCELLED";
    winnerFighterId: string | null;
  } | null;
}): PickResultState {
  if (!result || result.status === "PENDING") {
    return "pending";
  }

  if (
    result.status === "DRAW" ||
    result.status === "NO_CONTEST" ||
    result.status === "CANCELLED"
  ) {
    return "draw";
  }

  if (
    result.status === "WINNER" &&
    result.winnerFighterId === pickedFighterId
  ) {
    return "correct";
  }

  return "wrong";
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-neutral-50 px-4 py-3 text-center">
      <div className="truncate text-xs font-black uppercase tracking-wider text-neutral-400">
        {label}
      </div>

      <div className="mt-1 truncate text-lg font-black text-neutral-800">
        {value}
      </div>
    </div>
  );
}

function ResultIcon({ state }: { state: PickResultState }) {
  const src =
    state === "correct"
      ? "/correct.svg"
      : state === "wrong"
        ? "/wrong.svg"
        : state === "draw"
          ? "/draw.svg"
          : "/checkmark.svg";

  const alt =
    state === "correct"
      ? "Correct"
      : state === "wrong"
        ? "Wrong"
        : state === "draw"
          ? "Draw or no contest"
          : "Pending";

  return <img src={src} alt={alt} className="h-7 w-7 shrink-0" />;
}

function ResultLabel({ state }: { state: PickResultState }) {
  const label =
    state === "correct"
      ? "Correct"
      : state === "wrong"
        ? "Wrong"
        : state === "draw"
          ? "No winner"
          : "Pending";

  const className =
    state === "correct"
      ? "bg-green-100 text-green-700"
      : state === "wrong"
        ? "bg-red-100 text-red-700"
        : state === "draw"
          ? "bg-neutral-100 text-neutral-600"
          : "bg-blue-100 text-blue-700";

  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${className}`}
    >
      {label}
    </span>
  );
}

function FighterAvatar({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  if (imageUrl) {
    return (
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-neutral-100">
        <img
          src={imageUrl}
          alt={name}
          className="h-full w-full object-cover object-top"
        />
      </span>
    );
  }

  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-neutral-200 text-sm font-black text-neutral-700">
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

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatMethod(method: "KO_TKO" | "SUBMISSION" | "DECISION") {
  if (method === "KO_TKO") return "KO/TKO";
  if (method === "SUBMISSION") return "SUB";
  return "DEC";
}

type PredictionState =
  | "correct"
  | "wrong"
  | "missing"
  | "not_counted"
  | "not_applicable"
  | "pending";

function PredictionBreakdown({
  pickedMethod,
  pickedRound,
  methodState,
  roundState,
}: {
  pickedMethod: "KO_TKO" | "SUBMISSION" | "DECISION" | null;
  pickedRound: number | null;
  methodState: PredictionState;
  roundState: PredictionState;
}) {
  if (!pickedMethod) {
    return (
      <div className="mt-1 flex flex-wrap gap-1.5">
        <MiniBadge label="No method pick" state="missing" />
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      <MiniBadge
        label={`Method: ${formatMethod(pickedMethod)}`}
        state={methodState}
      />

      {(pickedMethod === "KO_TKO" || pickedMethod === "SUBMISSION") && (
        <MiniBadge
          label={pickedRound ? `Round: R${pickedRound}` : "No round"}
          state={roundState}
        />
      )}
    </div>
  );
}

function PickPointsBreakdown({
  points,
  rarityMultiplier,
}: {
  points: number;
  rarityMultiplier: number;
  winnerPickCount: number;
  totalPickCount: number;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {points > 0 && (
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
            rarityMultiplier > 1
              ? "bg-blue-100 text-blue-700"
              : "bg-neutral-100 text-neutral-500"
          }`}
        >
          ×{formatMultiplier(rarityMultiplier)}
        </span>
      )}

      <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-700">
        {points} pts
      </span>
    </div>
  );
}

function MiniBadge({
  label,
  state,
}: {
  label: string;
  state: PredictionState;
}) {
  const className =
    state === "correct"
      ? "bg-green-100 text-green-700"
      : state === "wrong"
        ? "bg-red-100 text-red-700"
        : state === "missing"
          ? "bg-neutral-100 text-neutral-500"
          : state === "pending"
            ? "bg-blue-100 text-blue-700"
            : "bg-neutral-100 text-neutral-400";

  const suffix = state === "correct" ? " ✓" : state === "wrong" ? " ✕" : "";

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${className}`}
    >
      {label}
      {suffix}
    </span>
  );
}

function getMethodPredictionState({
  isCorrectWinner,
  pickedMethod,
  resultMethod,
  resultStatus,
}: {
  isCorrectWinner: boolean;
  pickedMethod: "KO_TKO" | "SUBMISSION" | "DECISION" | null;
  resultMethod: "KO_TKO" | "SUBMISSION" | "DECISION" | null;
  resultStatus: string | null;
}): PredictionState {
  if (!resultStatus || resultStatus === "PENDING") return "pending";
  if (!isCorrectWinner) return "not_counted";
  if (!pickedMethod) return "missing";
  if (!resultMethod) return "not_applicable";

  return pickedMethod === resultMethod ? "correct" : "wrong";
}

function getRoundPredictionState({
  isCorrectWinner,
  pickedMethod,
  pickedRound,
  resultMethod,
  resultRound,
  resultStatus,
}: {
  isCorrectWinner: boolean;
  pickedMethod: "KO_TKO" | "SUBMISSION" | "DECISION" | null;
  pickedRound: number | null;
  resultMethod: "KO_TKO" | "SUBMISSION" | "DECISION" | null;
  resultRound: number | null;
  resultStatus: string | null;
}): PredictionState {
  if (!resultStatus || resultStatus === "PENDING") return "pending";
  if (!isCorrectWinner) return "not_counted";

  const resultHasRound =
    resultMethod === "KO_TKO" || resultMethod === "SUBMISSION";

  if (!resultHasRound) return "not_applicable";
  if (pickedMethod !== resultMethod) return "not_counted";
  if (!pickedRound) return "missing";
  if (!resultRound) return "not_applicable";

  return pickedRound === resultRound ? "correct" : "wrong";
}

function formatMultiplier(multiplier: number) {
  return Number.isInteger(multiplier)
    ? multiplier.toFixed(0)
    : multiplier.toFixed(2).replace(/0$/, "");
}

function formatPercentage(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}
