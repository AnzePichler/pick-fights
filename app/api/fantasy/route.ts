import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fantasyIsOpen, validateFantasyChoices } from "@/lib/fantasy";

const lineupSchema = z.object({
  eventId: z.string().min(1),
  choices: z.array(z.object({
    slot: z.enum(["CAPTAIN", "FINISH_ONE", "FINISH_TWO", "DECISION", "UNDERDOG"]),
    fightId: z.string().min(1),
    fighterId: z.string().min(1),
  })).length(5),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Log in to save your lineup." }, { status: 401 });
  }
  const parsed = lineupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a fighter for each of the five slots." }, { status: 400 });
  }
  const userId = session.user.id;
  const { eventId, choices } = parsed.data;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE`;
      const event = await tx.event.findUnique({
        where: { id: eventId },
        include: { fights: true },
      });
      if (!event || event.slug === "ufc-test") {
        return { error: "Event not found.", status: 404 };
      }
      if (!fantasyIsOpen(event)) {
        return { error: "Fantasy entries are closed for this event.", status: 403 };
      }
      const error = validateFantasyChoices(choices, event.fights);
      if (error) return { error, status: 400 };
      const lineup = await tx.fantasyLineup.upsert({
        where: { userId_eventId: { userId, eventId } },
        create: { userId, eventId, choices: { create: choices } },
        update: { choices: { deleteMany: {}, create: choices } },
        select: { updatedAt: true },
      });
      if (!fantasyIsOpen(event)) {
        throw new Error("FANTASY_DEADLINE_PASSED");
      }
      return { lineup };
    });

    if ("error" in outcome) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof Error && error.message === "FANTASY_DEADLINE_PASSED") {
      return NextResponse.json({ error: "The event locked before your lineup could be saved." }, { status: 403 });
    }
    console.error("Failed to save fantasy lineup", error);
    return NextResponse.json({ error: "Could not save your lineup. Please try again." }, { status: 500 });
  }
}
