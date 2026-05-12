// app/api/picks/submit/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const pickMethodSchema = z.enum(["KO_TKO", "SUBMISSION", "DECISION"]);

const submitPicksSchema = z.object({
  eventId: z.string().min(1),
  choices: z
    .array(
      z
        .object({
          fightId: z.string().min(1),
          pickedFighterId: z.string().min(1),
          pickedMethod: pickMethodSchema.nullable().optional(),
          pickedRound: z.number().int().min(1).max(5).nullable().optional(),
        })
        .transform((choice) => {
          const pickedMethod = choice.pickedMethod ?? null;

          return {
            ...choice,
            pickedMethod,
            pickedRound:
              pickedMethod === "KO_TKO" || pickedMethod === "SUBMISSION"
                ? (choice.pickedRound ?? null)
                : null,
          };
        }),
    )
    .min(1),
});

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          error: "You must be logged in to submit picks.",
        },
        {
          status: 401,
        },
      );
    }

    const body = await request.json();
    const parsed = submitPicksSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid picks submission.",
        },
        {
          status: 400,
        },
      );
    }

    const { eventId, choices } = parsed.data;
    const userId = session.user.id;

    const event = await prisma.event.findUnique({
      where: {
        id: eventId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        lockAt: true,
        fights: {
          where: {
            status: "ACTIVE",
          },
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

    const isTestEvent = event.slug === "ufc-test" && event.status === "DRAFT";

    if (!isTestEvent && event.status !== "OPEN") {
      return NextResponse.json(
        {
          error: "Picks are closed for this event.",
        },
        {
          status: 403,
        },
      );
    }

    if (!isTestEvent && event.lockAt.getTime() <= Date.now()) {
      return NextResponse.json(
        {
          error: "This event is already locked.",
        },
        {
          status: 403,
        },
      );
    }

    if (event.fights.length === 0) {
      return NextResponse.json(
        {
          error: "This event has no active fights.",
        },
        {
          status: 400,
        },
      );
    }

    const existingSubmission = await prisma.pickSubmission.findUnique({
      where: {
        userId_eventId: {
          userId,
          eventId,
        },
      },
      select: {
        id: true,
        choices: {
          select: {
            fightId: true,
          },
        },
      },
    });

    const fightsById = new Map(
      event.fights.map((fight) => {
        return [fight.id, fight];
      }),
    );

    const submittedFightIds = new Set(choices.map((choice) => choice.fightId));

    if (submittedFightIds.size !== choices.length) {
      return NextResponse.json(
        {
          error: "You submitted duplicate picks for the same fight.",
        },
        {
          status: 400,
        },
      );
    }

    const existingPickedFightIds = new Set(
      existingSubmission?.choices.map((choice) => choice.fightId) ?? [],
    );

    const requiredFightIds = event.fights
      .map((fight) => fight.id)
      .filter((fightId) => !existingPickedFightIds.has(fightId));

    if (requiredFightIds.length === 0) {
      return NextResponse.json(
        {
          error: "You already submitted all current fights for this event.",
        },
        {
          status: 409,
        },
      );
    }

    const requiredFightIdSet = new Set(requiredFightIds);

    if (choices.length !== requiredFightIds.length) {
      return NextResponse.json(
        {
          error: existingSubmission
            ? "You must pick every new fight before submitting."
            : "You must pick every fight before submitting.",
        },
        {
          status: 400,
        },
      );
    }

    for (const choice of choices) {
      if (!requiredFightIdSet.has(choice.fightId)) {
        return NextResponse.json(
          {
            error:
              "You can only submit picks for fights you have not picked yet.",
          },
          {
            status: 400,
          },
        );
      }

      const fight = fightsById.get(choice.fightId);

      if (!fight) {
        return NextResponse.json(
          {
            error:
              "One of your picks is for a fight that is not active in this event.",
          },
          {
            status: 400,
          },
        );
      }

      const pickedFighterBelongsToFight =
        choice.pickedFighterId === fight.fighterAId ||
        choice.pickedFighterId === fight.fighterBId;

      if (!pickedFighterBelongsToFight) {
        return NextResponse.json(
          {
            error: "One of your picks is not a fighter in that fight.",
          },
          {
            status: 400,
          },
        );
      }
    }

    const submission = existingSubmission
      ? await prisma.$transaction(async (tx) => {
          await tx.pickChoice.createMany({
            data: choices.map((choice) => ({
              submissionId: existingSubmission.id,
              fightId: choice.fightId,
              pickedFighterId: choice.pickedFighterId,
              pickedMethod: choice.pickedMethod,
              pickedRound: choice.pickedRound,
            })),
          });

          return tx.pickSubmission.findUniqueOrThrow({
            where: {
              id: existingSubmission.id,
            },
            select: {
              id: true,
              submittedAt: true,
            },
          });
        })
      : await prisma.pickSubmission.create({
          data: {
            userId,
            eventId,
            isLocked: true,
            choices: {
              create: choices.map((choice) => ({
                fightId: choice.fightId,
                pickedFighterId: choice.pickedFighterId,
                pickedMethod: choice.pickedMethod,
                pickedRound: choice.pickedRound,
              })),
            },
          },
          select: {
            id: true,
            submittedAt: true,
          },
        });

    return NextResponse.json(
      {
        submission,
      },
      {
        status: existingSubmission ? 200 : 201,
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "You already submitted one of these picks. Please refresh the page.",
        },
        {
          status: 409,
        },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error: "Failed to submit picks.",
      },
      {
        status: 500,
      },
    );
  }
}
