// app/api/admin/results/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  calculatePickPoints,
  getRarityMultiplier,
  isCorrectWinnerPick,
} from "../../../lib/scoring";

const fightResultStatusSchema = z.enum([
  "PENDING",
  "WINNER",
  "DRAW",
  "NO_CONTEST",
  "CANCELLED",
]);

const fightMethodSchema = z.enum(["KO_TKO", "SUBMISSION", "DECISION"]);

const resultSchema = z.object({
  fightId: z.string().min(1),
  status: fightResultStatusSchema,
  winnerFighterId: z.string().nullable(),
  method: fightMethodSchema.nullable(),
  round: z.number().int().min(1).max(5).nullable(),
});

const updateResultsSchema = z.object({
  eventId: z.string().min(1),
  markCompleted: z.boolean().optional().default(false),
  results: z.array(resultSchema).min(1),
});

export async function PATCH(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          error: "You must be logged in.",
        },
        {
          status: 401,
        },
      );
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        {
          error: "You are not allowed to update results.",
        },
        {
          status: 403,
        },
      );
    }

    const body = await request.json();
    const parsed = updateResultsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || "Invalid result data.",
        },
        {
          status: 400,
        },
      );
    }

    const { eventId, results, markCompleted } = parsed.data;

    const event = await prisma.event.findUnique({
      where: {
        id: eventId,
      },
      select: {
        id: true,
        fights: {
          select: {
            id: true,
            fighterAId: true,
            fighterBId: true,
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json(
        {
          error: "Event not found.",
        },
        {
          status: 404,
        },
      );
    }

    const fightsById = new Map(
      event.fights.map((fight) => {
        return [fight.id, fight];
      }),
    );

    for (const result of results) {
      const fight = fightsById.get(result.fightId);

      if (!fight) {
        return NextResponse.json(
          {
            error: "One of the results is for a fight outside this event.",
          },
          {
            status: 400,
          },
        );
      }

      if (result.status === "WINNER") {
        const winnerIsInFight =
          result.winnerFighterId === fight.fighterAId ||
          result.winnerFighterId === fight.fighterBId;

        if (!result.winnerFighterId || !winnerIsInFight) {
          return NextResponse.json(
            {
              error: "Winner must be one of the fighters in the fight.",
            },
            {
              status: 400,
            },
          );
        }
      }

      if (result.status !== "WINNER" && result.winnerFighterId) {
        return NextResponse.json(
          {
            error: "Only winner results can have a winner.",
          },
          {
            status: 400,
          },
        );
      }

      if (result.status !== "WINNER" && (result.method || result.round)) {
        return NextResponse.json(
          {
            error: "Only winner results can have method or round.",
          },
          {
            status: 400,
          },
        );
      }
    }

    await prisma.$transaction([
      ...results.map((result) => {
        const isWinner = result.status === "WINNER";

        return prisma.fightResult.upsert({
          where: {
            fightId: result.fightId,
          },
          create: {
            fightId: result.fightId,
            status: result.status,
            winnerFighterId: isWinner ? result.winnerFighterId : null,
            method: isWinner ? result.method : null,
            round: isWinner ? result.round : null,
          },
          update: {
            status: result.status,
            winnerFighterId: isWinner ? result.winnerFighterId : null,
            method: isWinner ? result.method : null,
            round: isWinner ? result.round : null,
          },
        });
      }),

      ...(markCompleted
        ? [
            prisma.event.update({
              where: {
                id: eventId,
              },
              data: {
                status: "COMPLETED",
              },
            }),
          ]
        : []),
    ]);

    await recalculateEventScores(eventId);

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Failed to update results.",
      },
      {
        status: 500,
      },
    );
  }
}

async function recalculateEventScores(eventId: string) {
  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    select: {
      id: true,
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

  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }

  const fightStats = new Map<
    string,
    {
      totalPickCount: number;
      winnerPickCount: number;
    }
  >();

  for (const submission of event.submissions) {
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

  const scoreRows = event.submissions.map((submission) => {
    let correct = 0;
    let points = 0;
    const totalPicked = submission.choices.length;

    for (const choice of submission.choices) {
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
        result,
        rarityMultiplier,
      });
    }

    const correctPercentage =
      totalPicked === 0 ? 0 : Math.round((correct / totalPicked) * 1000) / 10;

    return {
      userId: submission.userId,
      eventId: event.id,
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
        eventId: event.id,
      },
    });

    if (scoreRows.length > 0) {
      await tx.userEventScore.createMany({
        data: scoreRows,
      });
    }
  });
}
