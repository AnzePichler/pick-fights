// app/events/page.tsx
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

type PickResultStatus =
  | "PENDING"
  | "WINNER"
  | "DRAW"
  | "NO_CONTEST"
  | "CANCELLED";

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

export default async function EventsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const events = await prisma.event.findMany({
    where: {
      status: "COMPLETED",
      slug: {
        not: "ufc-test",
      },
      submissions: {
        some: {},
      },
    },
    orderBy: {
      startsAt: "desc",
    },
    include: {
      fights: {
        where: {
          status: "ACTIVE",
        },
        include: {
          fighterA: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              countryFlagUrl: true,
              country: true,
              record: true,
            },
          },
          fighterB: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              countryFlagUrl: true,
              country: true,
              record: true,
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
        orderBy: {
          order: "asc",
        },
      },
      submissions: {
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
          },
        },
      },
    },
  });

  const eventCards = events.map((event) => {
    const fightMap = new Map(
      event.fights.map((fight) => [
        fight.id,
        {
          fighterAId: fight.fighterA.id,
          fighterBId: fight.fighterB.id,
        },
      ]),
    );

    const communityPicks: Record<string, FightCommunityPicks> = {};

    for (const fight of event.fights) {
      communityPicks[fight.id] = {
        fighterA: [],
        fighterB: [],
      };
    }

    for (const submission of event.submissions) {
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

    const leaderboardRows = getEventLeaderboardRows(event.submissions);

    return {
      id: event.id,
      name: event.name,
      status: event.status,
      startsAt: event.startsAt,
      fights: event.fights,
      submissionsCount: event.submissions.length,
      communityPicks,
      leaderboardRows,
    };
  });

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-zinc-100 p-6 text-black">
        <section className="mx-auto max-w-6xl">
          <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
            <h1 className="text-4xl font-black tracking-tight">Events</h1>

            <p className="mt-2 text-sm font-semibold text-neutral-500">
              Browse previous event picks and event-specific leaderboards.
            </p>
          </div>

          {eventCards.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
              <h2 className="text-2xl font-black">No events yet.</h2>

              <p className="mt-2 text-sm font-semibold text-neutral-500">
                Events with submitted picks will show up here.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {eventCards.map((event, index) => {
                const winner = event.leaderboardRows[0];

                return (
                  <details
                    key={event.id}
                    className="group overflow-hidden rounded-3xl bg-white shadow-sm"
                  >
                    <summary className="cursor-pointer list-none p-6">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="text-xs font-black uppercase tracking-widest text-neutral-400">
                              {event.status}
                            </div>

                            <span className="text-neutral-300 transition group-open:rotate-180">
                              ▼
                            </span>
                          </div>

                          <h2 className="mt-1 truncate text-2xl font-black text-neutral-900 md:text-3xl">
                            {event.name}
                          </h2>

                          <p className="mt-1 text-sm font-semibold text-neutral-500">
                            {formatDate(event.startsAt)} ·{" "}
                            {event.submissionsCount}{" "}
                            {event.submissionsCount === 1
                              ? "submission"
                              : "submissions"}
                          </p>
                        </div>

                        <div className="grid w-full grid-cols-3 gap-3 md:w-[560px]">
                          <StatBox
                            label="Fights"
                            value={String(event.fights.length)}
                          />

                          <StatBox
                            label="Players"
                            value={String(event.submissionsCount)}
                          />

                          <StatBox
                            label="Winner"
                            value={
                              winner ? `${winner.name} · ${winner.points}` : "—"
                            }
                          />
                        </div>
                      </div>
                    </summary>

                    <div className="border-t border-neutral-100 p-4 md:p-6">
                      <details className="mb-5 overflow-hidden rounded-2xl border border-neutral-100 bg-neutral-50">
                        <summary className="cursor-pointer list-none px-4 py-4 md:px-5">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <h3 className="text-lg font-black text-neutral-900">
                                Event leaderboard
                              </h3>

                              <p className="mt-1 text-xs font-semibold text-neutral-500">
                                Points for this event only.
                              </p>
                            </div>

                            <span className="text-sm font-black text-neutral-400">
                              ▼
                            </span>
                          </div>
                        </summary>

                        <div className="border-t border-neutral-100 bg-white">
                          {event.leaderboardRows.length === 0 ? (
                            <div className="p-5 text-sm font-semibold text-neutral-500">
                              No leaderboard data for this event.
                            </div>
                          ) : (
                            <EventLeaderboard rows={event.leaderboardRows} />
                          )}
                        </div>
                      </details>

                      <div className="space-y-5">
                        {event.fights.map((fight) => (
                          <EventFightCard
                            key={fight.id}
                            fight={fight}
                            picks={event.communityPicks[fight.id]}
                          />
                        ))}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function getEventLeaderboardRows(
  submissions: Array<{
    user: {
      id: string;
      username: string;
      displayName: string | null;
      imageUrl: string | null;
    };
    choices: Array<{
      fightId: string;
      pickedFighterId: string;
      pickedMethod: "KO_TKO" | "SUBMISSION" | "DECISION" | null;
      pickedRound: number | null;
      fight: {
        result: {
          status: "PENDING" | "WINNER" | "DRAW" | "NO_CONTEST" | "CANCELLED";
          winnerFighterId: string | null;
          method?: "KO_TKO" | "SUBMISSION" | "DECISION" | null;
          round?: number | null;
        } | null;
      };
    }>;
  }>,
): LeaderboardRow[] {
  const fightStats = new Map<
    string,
    {
      totalPickCount: number;
      winnerPickCount: number;
    }
  >();

  for (const submission of submissions) {
    for (const choice of submission.choices) {
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
  }

  const rows = submissions.map((submission) => {
    let correct = 0;
    let totalPicked = 0;
    let points = 0;

    for (const choice of submission.choices) {
      totalPicked += 1;

      const result = choice.fight.result;

      const isCorrect = isCorrectWinnerPick({
        pickedFighterId: choice.pickedFighterId,
        result,
      });

      if (isCorrect) {
        correct += 1;
      }

      const stats = fightStats.get(choice.fightId) || {
        totalPickCount: 0,
        winnerPickCount: 0,
      };

      const rarityMultiplier = getRarityMultiplier(stats);

      points += calculatePickPoints({
        pickedFighterId: choice.pickedFighterId,
        pickedMethod: choice.pickedMethod,
        pickedRound: choice.pickedRound,
        result: result
          ? {
              status: result.status,
              winnerFighterId: result.winnerFighterId,
              method: result.method ?? null,
              round: result.round ?? null,
            }
          : null,
        rarityMultiplier,
      });
    }

    const correctPercentage =
      totalPicked === 0 ? 0 : Math.round((correct / totalPicked) * 1000) / 10;

    return {
      userId: submission.user.id,
      position: 0,
      name: submission.user.displayName || submission.user.username,
      username: submission.user.username,
      imageUrl: submission.user.imageUrl,
      correct,
      totalPicked,
      correctPercentage,
      points,
    };
  });

  return rows
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.correct !== a.correct) return b.correct - a.correct;
      if (b.correctPercentage !== a.correctPercentage) {
        return b.correctPercentage - a.correctPercentage;
      }

      return a.name.localeCompare(b.name);
    })
    .map((row) => ({
      ...row,
    }));
}

function EventLeaderboard({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <div className="divide-y divide-neutral-100">
      {rows.map((row) => (
        <div
          key={row.userId}
          className="flex items-center justify-between gap-4 px-4 py-4 md:px-5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <PositionBadge position={row.position} />

            <Avatar imageUrl={row.imageUrl} name={row.name} />

            <div className="min-w-0">
              <div className="truncate text-base font-black text-neutral-800">
                {row.name}
              </div>

              <div className="truncate text-xs font-semibold text-neutral-400">
                @{row.username}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-700 sm:block">
              {row.correct}/{row.totalPicked} · {row.correctPercentage}%
            </div>

            <div className="rounded-full bg-blue-100 px-3 py-1 text-sm font-black text-blue-700">
              {row.points} pts
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventFightCard({
  fight,
  picks,
}: {
  fight: {
    id: string;
    weightClass: string | null;
    fighterA: {
      id: string;
      name: string;
      imageUrl: string | null;
      countryFlagUrl: string | null;
      country: string | null;
      record: string | null;
    };
    fighterB: {
      id: string;
      name: string;
      imageUrl: string | null;
      countryFlagUrl: string | null;
      country: string | null;
      record: string | null;
    };
    result: {
      status: PickResultStatus;
      winnerFighterId: string | null;
    } | null;
  };
  picks?: FightCommunityPicks;
}) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] items-center gap-2 p-4 md:grid-cols-[1fr_130px_1fr] md:p-5">
        <FighterMini fighter={fight.fighterA} align="left" />

        <div className="text-center">
          {fight.weightClass && (
            <div className="mb-1 truncate text-[9px] font-semibold capitalize tracking-[0.05em] text-neutral-400 md:text-xs">
              {formatWeightClass(fight.weightClass)}
            </div>
          )}

          <div className="text-xs font-black text-neutral-400">VS</div>
        </div>

        <FighterMini fighter={fight.fighterB} align="right" />
      </div>

      <div className="border-t border-neutral-100 px-4 py-3 md:px-5 md:py-4">
        <OthersPickRow
          fighterAId={fight.fighterA.id}
          fighterBId={fight.fighterB.id}
          fighterAName={fight.fighterA.name}
          fighterBName={fight.fighterB.name}
          result={fight.result}
          picks={picks}
        />
      </div>
    </div>
  );
}

function FighterMini({
  fighter,
  align,
}: {
  fighter: {
    name: string;
    imageUrl: string | null;
    countryFlagUrl: string | null;
    country: string | null;
    record: string | null;
  };
  align: "left" | "right";
}) {
  const isRight = align === "right";

  return (
    <div
      className={`flex min-w-0 items-center gap-3 ${
        isRight ? "flex-row-reverse text-right" : "text-left"
      }`}
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 md:h-20 md:w-20">
        <img
          src={fighter.imageUrl || "/fighter-placeholder.png"}
          alt={fighter.name}
          className="h-full w-full object-cover object-top"
        />
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-black text-neutral-800 md:text-lg">
          {fighter.name}
        </div>

        <div
          className={`mt-1 flex flex-wrap items-center gap-1 text-xs font-semibold text-neutral-500 ${
            isRight ? "justify-end" : "justify-start"
          }`}
        >
          {!isRight && <CountryFlag fighter={fighter} />}

          <span>{fighter.record || "—"}</span>

          {isRight && <CountryFlag fighter={fighter} />}
        </div>
      </div>
    </div>
  );
}

function OthersPickRow({
  fighterAId,
  fighterBId,
  fighterAName,
  fighterBName,
  result,
  picks,
}: {
  fighterAId: string;
  fighterBId: string;
  fighterAName: string;
  fighterBName: string;
  result?: {
    status: PickResultStatus;
    winnerFighterId: string | null;
  } | null;
  picks?: FightCommunityPicks;
}) {
  const fighterAPicks = picks?.fighterA || [];
  const fighterBPicks = picks?.fighterB || [];
  const total = fighterAPicks.length + fighterBPicks.length;

  const fighterAPercent =
    total === 0 ? 0 : Math.round((fighterAPicks.length / total) * 100);

  const fighterBPercent =
    total === 0 ? 0 : Math.round((fighterBPicks.length / total) * 100);

  const resultStatus = result?.status;
  const hasResult = resultStatus && resultStatus !== "PENDING";

  const isDrawLike =
    resultStatus === "DRAW" ||
    resultStatus === "NO_CONTEST" ||
    resultStatus === "CANCELLED";

  const fighterAOutcome = getCommunityOutcome({
    fighterId: fighterAId,
    winnerFighterId: result?.winnerFighterId || null,
    hasResult: Boolean(hasResult),
    isDrawLike,
  });

  const fighterBOutcome = getCommunityOutcome({
    fighterId: fighterBId,
    winnerFighterId: result?.winnerFighterId || null,
    hasResult: Boolean(hasResult),
    isDrawLike,
  });

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-5">
      <PickGroup
        name={fighterAName}
        users={fighterAPicks}
        percent={fighterAPercent}
        align="left"
        outcome={fighterAOutcome}
      />

      <PickGroup
        name={fighterBName}
        users={fighterBPicks}
        percent={fighterBPercent}
        align="right"
        outcome={fighterBOutcome}
      />
    </div>
  );
}

function getCommunityOutcome({
  fighterId,
  winnerFighterId,
  hasResult,
  isDrawLike,
}: {
  fighterId: string;
  winnerFighterId: string | null;
  hasResult: boolean;
  isDrawLike: boolean;
}) {
  if (!hasResult) return "pending";
  if (isDrawLike) return "draw";
  if (winnerFighterId === fighterId) return "winner";

  return "loser";
}

function PickGroup({
  name,
  users,
  percent,
  align,
  outcome,
}: {
  name: string;
  users: CommunityPickUser[];
  percent: number;
  align: "left" | "right";
  outcome: "pending" | "winner" | "loser" | "draw";
}) {
  const isRight = align === "right";
  const shownUsers = users.slice(0, 4);
  const extraCount = users.length - shownUsers.length;

  const directionClass = isRight ? "bg-gradient-to-l" : "bg-gradient-to-r";

  const outcomeGradient =
    outcome === "winner"
      ? `${directionClass} from-green-500 via-transparent to-transparent`
      : outcome === "loser"
        ? `${directionClass} from-red-500 via-transparent to-transparent`
        : outcome === "draw"
          ? `${directionClass} from-neutral-500 via-transparent to-transparent`
          : "bg-transparent";

  const outcomeLabel =
    outcome === "winner"
      ? "WON"
      : outcome === "loser"
        ? "LOST"
        : outcome === "draw"
          ? "NO WINNER"
          : null;

  const outcomeBadgeClass =
    outcome === "winner"
      ? "bg-green-100 text-green-700"
      : outcome === "loser"
        ? "bg-red-100 text-red-700"
        : "bg-neutral-100 text-neutral-600";

  return (
    <div className={`rounded-2xl p-[2px] ${outcomeGradient}`}>
      <div
        className={`min-w-0 rounded-[0.9rem] bg-white px-2.5 py-2 ${
          isRight ? "text-right" : "text-left"
        }`}
      >
        <div
          className={`flex items-center gap-2 ${
            isRight ? "justify-end" : "justify-start"
          }`}
        >
          {!isRight && outcomeLabel && (
            <div
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${outcomeBadgeClass}`}
            >
              {outcomeLabel}
            </div>
          )}

          <div className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400 md:text-xs">
            Picked {name}
          </div>

          {isRight && outcomeLabel && (
            <div
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${outcomeBadgeClass}`}
            >
              {outcomeLabel}
            </div>
          )}
        </div>

        <div
          className={`mt-2 flex items-center gap-2 ${
            isRight ? "justify-end" : "justify-start"
          }`}
        >
          <div
            className={`flex min-w-0 shrink items-center gap-1 ${
              isRight ? "justify-end" : "justify-start"
            }`}
          >
            {shownUsers.map((user) => (
              <Avatar key={user.id} imageUrl={user.imageUrl} name={user.name} />
            ))}

            {extraCount > 0 && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-black text-neutral-600 md:h-9 md:w-9 md:text-xs">
                +{extraCount}
              </div>
            )}
          </div>

          <div className="shrink-0 leading-tight">
            <div className="text-xs font-black text-neutral-800 md:text-sm">
              {users.length}
            </div>

            <div className="text-xs font-bold text-blue-600 md:text-sm">
              {percent}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-center">
      <div className="text-xs font-black uppercase tracking-wider text-neutral-400">
        {label}
      </div>

      <div className="mt-1 truncate text-lg font-black text-neutral-800">
        {value}
      </div>
    </div>
  );
}

function PositionBadge({ position }: { position: number }) {
  const label =
    position === 1
      ? "🥇"
      : position === 2
        ? "🥈"
        : position === 3
          ? "🥉"
          : `#${position}`;

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 text-base font-black text-neutral-700">
      {label}
    </div>
  );
}

function Avatar({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  if (imageUrl) {
    return (
      <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-200 md:h-9 md:w-9">
        <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-300 text-[10px] font-black text-neutral-700 md:h-9 md:w-9 md:text-xs">
      {getInitials(name)}
    </span>
  );
}

function CountryFlag({
  fighter,
}: {
  fighter: {
    countryFlagUrl: string | null;
    country: string | null;
  };
}) {
  if (!fighter.countryFlagUrl) return null;

  return (
    <span className="inline-flex h-4 w-6 shrink-0 overflow-hidden md:h-5 md:w-7">
      <img
        src={fighter.countryFlagUrl}
        alt={fighter.country || "Country flag"}
        title={fighter.country || undefined}
        className="h-full w-full object-cover"
      />
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

function formatWeightClass(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/women'?s/g, "")
    .replace(/men'?s/g, "")
    .replace(/bout/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.includes("strawweight")) return "strawweight";
  if (normalized.includes("flyweight")) return "flyweight";
  if (normalized.includes("bantamweight")) return "bantamweight";
  if (normalized.includes("featherweight")) return "featherweight";

  if (
    normalized.includes("light heavyweight") ||
    normalized.includes("lightheavyweight")
  ) {
    return "lightheavyweight";
  }

  if (normalized.includes("lightweight")) return "lightweight";
  if (normalized.includes("welterweight")) return "welterweight";
  if (normalized.includes("middleweight")) return "middleweight";
  if (normalized.includes("heavyweight")) return "heavyweight";

  return value
    .replace(/women'?s/gi, "")
    .replace(/men'?s/gi, "")
    .replace(/bout/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
