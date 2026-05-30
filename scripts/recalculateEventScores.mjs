import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from your .env file.");
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

const BASE_WINNER_POINTS = 50;

const args = process.argv.slice(2);
const SHOULD_RECALCULATE_ALL = args.includes("--all");
const EVENT_SLUG = args.find((arg) => !arg.startsWith("--"));

function getRarityMultiplier({ winnerPickCount, totalPickCount }) {
  if (totalPickCount <= 0 || winnerPickCount <= 0) {
    return 1;
  }

  const percentage = (winnerPickCount / totalPickCount) * 100;

  if (percentage >= 60) return 1;
  if (percentage >= 40) return 1.15;
  if (percentage >= 25) return 1.3;
  if (percentage >= 10) return 1.5;

  return 1.75;
}

function getMethodBonus({
  pickedMethod,
  pickedRound,
  resultMethod,
  resultRound,
}) {
  if (!pickedMethod || !resultMethod) {
    return 0;
  }

  if (pickedMethod !== resultMethod) {
    return 0;
  }

  if (resultMethod === "DECISION") {
    return 15;
  }

  if (resultMethod === "KO_TKO" || resultMethod === "SUBMISSION") {
    if (
      pickedRound != null &&
      resultRound != null &&
      pickedRound === resultRound
    ) {
      return 50;
    }

    return 25;
  }

  return 0;
}

function calculatePickPoints({
  pickedFighterId,
  pickedMethod,
  pickedRound,
  result,
  rarityMultiplier,
}) {
  if (!result || result.status !== "WINNER") {
    return 0;
  }

  if (!result.winnerFighterId) {
    return 0;
  }

  if (pickedFighterId !== result.winnerFighterId) {
    return 0;
  }

  const methodBonus = getMethodBonus({
    pickedMethod,
    pickedRound,
    resultMethod: result.method,
    resultRound: result.round,
  });

  return Math.round((BASE_WINNER_POINTS + methodBonus) * rarityMultiplier);
}

function isCorrectWinnerPick({ pickedFighterId, result }) {
  return (
    result?.status === "WINNER" && result.winnerFighterId === pickedFighterId
  );
}

async function recalculateEvent(event) {
  const fullEvent = await prisma.event.findUnique({
    where: {
      id: event.id,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      submissions: {
        select: {
          userId: true,
          choices: {
            select: {
              fightId: true,
              pickedFighterId: true,
              pickedMethod: true,
              pickedRound: true,
              fight: {
                select: {
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

  if (!fullEvent) {
    throw new Error(`Event not found: ${event.id}`);
  }

  const fightStats = new Map();

  for (const submission of fullEvent.submissions) {
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

  const rows = fullEvent.submissions.map((submission) => {
    let correct = 0;
    let points = 0;
    const totalPicked = submission.choices.length;

    for (const choice of submission.choices) {
      const result = choice.fight.result;

      if (
        isCorrectWinnerPick({
          pickedFighterId: choice.pickedFighterId,
          result,
        })
      ) {
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
        result,
        rarityMultiplier,
      });
    }

    const correctPercentage =
      totalPicked === 0 ? 0 : Math.round((correct / totalPicked) * 1000) / 10;

    return {
      userId: submission.userId,
      eventId: fullEvent.id,
      points,
      correct,
      totalPicked,
      correctPercentage,
      computedAt: new Date(),
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.userEventScore.deleteMany({
      where: {
        eventId: fullEvent.id,
      },
    });

    if (rows.length > 0) {
      await tx.userEventScore.createMany({
        data: rows,
      });
    }
  });

  console.log(
    `Recalculated ${rows.length} scores for ${fullEvent.name} (${fullEvent.slug})`,
  );
}

async function main() {
  if (!SHOULD_RECALCULATE_ALL && !EVENT_SLUG) {
    throw new Error(
      "Missing event slug. Example: node scripts/recalculateEventScores.mjs ufc-328 or node scripts/recalculateEventScores.mjs --all",
    );
  }

  const events = SHOULD_RECALCULATE_ALL
    ? await prisma.event.findMany({
        where: {
          slug: {
            not: "ufc-test",
          },
          submissions: {
            some: {},
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
        orderBy: {
          startsAt: "desc",
        },
      })
    : [
        await prisma.event.findUnique({
          where: {
            slug: EVENT_SLUG,
          },
          select: {
            id: true,
            name: true,
            slug: true,
          },
        }),
      ].filter(Boolean);

  if (events.length === 0) {
    throw new Error(`No events found.`);
  }

  for (const event of events) {
    await recalculateEvent(event);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
