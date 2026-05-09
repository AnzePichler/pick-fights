// app/api/picks/submit/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const submitPicksSchema = z.object({
  eventId: z.string().min(1),
  choices: z
    .array(
      z.object({
        fightId: z.string().min(1),
        pickedFighterId: z.string().min(1),
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
          error: "This event has no fights.",
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
      },
    });

    if (existingSubmission) {
      return NextResponse.json(
        {
          error:
            "You already submitted picks for this event. Picks are locked.",
        },
        {
          status: 409,
        },
      );
    }

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

    if (choices.length !== event.fights.length) {
      return NextResponse.json(
        {
          error: "You must pick every fight before submitting.",
        },
        {
          status: 400,
        },
      );
    }

    for (const choice of choices) {
      const fight = fightsById.get(choice.fightId);

      if (!fight) {
        return NextResponse.json(
          {
            error:
              "One of your picks is for a fight that is not in this event.",
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

    const submission = await prisma.pickSubmission.create({
      data: {
        userId,
        eventId,
        isLocked: true,
        choices: {
          create: choices.map((choice) => ({
            fightId: choice.fightId,
            pickedFighterId: choice.pickedFighterId,
            pickedMethod: "DECISION",
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
        status: 201,
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
            "You already submitted picks for this event. Picks are locked.",
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
