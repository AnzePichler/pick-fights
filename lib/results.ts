import { Prisma, type PrismaClient, type ResultSource } from "@prisma/client";
import { z } from "zod";
import { calculatePickPoints, getRarityMultiplier, isCorrectWinnerPick } from "@/app/lib/scoring";

export const resultSchema = z.object({
  fightId: z.string().min(1),
  status: z.enum(["PENDING", "WINNER", "DRAW", "NO_CONTEST", "CANCELLED"]),
  winnerFighterId: z.string().nullable(),
  method: z.enum(["KO_TKO", "SUBMISSION", "DECISION"]).nullable(),
  round: z.number().int().min(1).max(5).nullable(),
});

export type ResultUpdate = z.infer<typeof resultSchema>;
export class ResultError extends Error {}

export async function withEventLock<T>(client: PrismaClient, eventId: string, action: (transaction: Prisma.TransactionClient) => Promise<T>) {
  return client.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE`;
    if (!rows.length) throw new ResultError("Event not found.");
    return action(transaction);
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function recalculateEventScores(transaction: Prisma.TransactionClient, eventId: string) {
  const submissions = await transaction.pickSubmission.findMany({
    where: { eventId },
    select: { userId: true, choices: { select: {
      id: true, fightId: true, pickedFighterId: true, pickedMethod: true, pickedRound: true,
      fight: { select: { result: true } },
    } } },
  });
  const stats = new Map<string, { totalPickCount: number; winnerPickCount: number }>();
  for (const submission of submissions) {
    for (const choice of submission.choices) {
      if (choice.fight.result?.status !== "WINNER") continue;
      const counts = stats.get(choice.fightId) ?? { totalPickCount: 0, winnerPickCount: 0 };
      counts.totalPickCount++;
      if (choice.pickedFighterId === choice.fight.result.winnerFighterId) counts.winnerPickCount++;
      stats.set(choice.fightId, counts);
    }
  }
  const choices = [];
  for (const submission of submissions) {
    let points = 0;
    let correct = 0;
    for (const choice of submission.choices) {
      const counts = stats.get(choice.fightId) ?? { totalPickCount: 0, winnerPickCount: 0 };
      const rarityMultiplier = getRarityMultiplier(counts);
      const pickPoints = calculatePickPoints({ ...choice, result: choice.fight.result, rarityMultiplier });
      points += pickPoints;
      if (isCorrectWinnerPick({ ...choice, result: choice.fight.result })) correct++;
      choices.push({ id: choice.id, points: pickPoints, rarityMultiplier, ...counts });
    }
    const totalPicked = submission.choices.length;
    const data = { points, correct, totalPicked, correctPercentage: totalPicked ? Math.round(correct / totalPicked * 1000) / 10 : 0, computedAt: new Date() };
    await transaction.userEventScore.upsert({
      where: { userId_eventId: { userId: submission.userId, eventId } },
      create: { userId: submission.userId, eventId, ...data }, update: data,
    });
  }
  if (choices.length) {
    await transaction.$executeRaw`
      UPDATE "PickChoice" AS choice
      SET "points" = value.points, "rarityMultiplier" = value.multiplier,
          "winnerPickCount" = value.winners, "totalPickCount" = value.total
      FROM jsonb_to_recordset(${JSON.stringify(choices.map((choice) => ({
        id: choice.id, points: choice.points, multiplier: choice.rarityMultiplier,
        winners: choice.winnerPickCount, total: choice.totalPickCount,
      })))}::jsonb) AS value(id text, points integer, multiplier double precision, winners integer, total integer)
      WHERE choice."id" = value.id
    `;
  }
  await transaction.userEventScore.deleteMany({ where: { eventId, userId: { notIn: submissions.map((submission) => submission.userId) } } });
}

export async function applyResults(transaction: Prisma.TransactionClient, eventId: string, updates: ResultUpdate[], source: ResultSource, markCompleted = false) {
  const event = await transaction.event.findUniqueOrThrow({ where: { id: eventId }, include: { fights: { include: { result: true } } } });
  const fights = new Map(event.fights.map((fight) => [fight.id, fight]));
  if (new Set(updates.map((result) => result.fightId)).size !== updates.length) throw new ResultError("Duplicate fight results.");
  let changed = false;
  for (const result of updates) {
    const fight = fights.get(result.fightId);
    if (!fight) throw new ResultError("Result is for a fight outside this event.");
    if (result.status === "WINNER") {
      if (result.winnerFighterId !== fight.fighterAId && result.winnerFighterId !== fight.fighterBId) throw new ResultError("Winner must be one of the fighters in the fight.");
    } else if (result.winnerFighterId || result.method || result.round) {
      throw new ResultError("Only winner results can have a winner, method or round.");
    }
    const existing = fight.result;
    if (source === "UFCALENDAR" && existing?.source === "MANUAL") continue;
    if (!existing && result.status === "PENDING") continue;
    if (existing && existing.source === source && existing.status === result.status && existing.winnerFighterId === result.winnerFighterId && existing.method === result.method && existing.round === result.round) continue;
    const { fightId, ...data } = result;
    await transaction.fightResult.upsert({ where: { fightId }, create: { fightId, ...data, source }, update: { ...data, source } });
    await transaction.fightResultChange.create({ data: {
      fightId, source, snapshot: { before: existing ? { status: existing.status, winnerFighterId: existing.winnerFighterId, method: existing.method, round: existing.round, source: existing.source } : null, after: data },
    } });
    changed = true;
  }
  let completed = event.status === "COMPLETED";
  if (markCompleted && !completed) {
    const pending = await transaction.fight.count({ where: { eventId, status: "ACTIVE", OR: [{ result: null }, { result: { status: "PENDING" } }] } });
    if (pending) throw new ResultError("Resolve every active fight before completing the event.");
    completed = true;
    changed = true;
  }
  if (changed) {
    await recalculateEventScores(transaction, eventId);
    await transaction.event.update({ where: { id: eventId }, data: {
      resultVersion: { increment: 1 }, lastResultAt: new Date(), ...(completed ? { status: "COMPLETED" } : {}),
    } });
  }
  return { changed, completed };
}
