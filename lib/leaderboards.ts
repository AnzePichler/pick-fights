import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";

export type LeaderboardRow = {
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

export const getLeaderboardEvent = unstable_cache(
  async () => {
    const [activeEvent, lastCompletedEvent] = await Promise.all([
      prisma.event.findFirst({
        where: {
          isActive: true,
          slug: { not: "ufc-test" },
          status: { in: ["OPEN", "LOCKED"] },
        },
        select: {
          id: true,
          name: true,
          status: true,
          fights: {
            where: { result: { is: { status: { not: "PENDING" } } } },
            take: 1,
            select: { id: true },
          },
        },
      }),
      prisma.event.findFirst({
        where: { slug: { not: "ufc-test" }, status: "COMPLETED" },
        orderBy: { startsAt: "desc" },
        select: { id: true, name: true, status: true },
      }),
    ]);

    const selectedEvent = activeEvent?.fights.length
      ? activeEvent
      : (lastCompletedEvent ?? activeEvent);

    return selectedEvent
      ? {
          id: selectedEvent.id,
          name: selectedEvent.name,
          status: selectedEvent.status,
        }
      : null;
  },
  ["leaderboard-event"],
  { revalidate: 30, tags: ["leaderboards"] },
);

export const getEventLeaderboardRows = unstable_cache(
  async (eventId: string): Promise<LeaderboardRow[]> => {
    const scores = await prisma.userEventScore.findMany({
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
      },
      orderBy: [
        {
          points: "desc",
        },
        {
          correct: "desc",
        },
        {
          correctPercentage: "desc",
        },
      ],
    });

    return scores.map((score, index) => ({
      userId: score.user.id,
      position: index + 1,
      name: score.user.displayName || score.user.username,
      username: score.user.username,
      imageUrl: score.user.imageUrl,
      correct: score.correct,
      totalPicked: score.totalPicked,
      correctPercentage: score.correctPercentage,
      points: score.points,
    }));
  },
  ["event-leaderboard"],
  { revalidate: 30, tags: ["leaderboards"] },
);

export const getAllTimeLeaderboardRows = unstable_cache(
  async (): Promise<LeaderboardRow[]> => {
    const totals = await prisma.userEventScore.groupBy({
      by: ["userId"],
      where: {
        event: {
          slug: {
            not: "ufc-test",
          },
          status: "COMPLETED",
        },
      },
      _sum: {
        points: true,
        correct: true,
        totalPicked: true,
      },
    });

    const users = await prisma.user.findMany({
      where: {
        id: {
          in: totals.map((row) => row.userId),
        },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        imageUrl: true,
      },
    });

    const userById = new Map(users.map((user) => [user.id, user]));

    const rows = totals.map((row) => {
      const user = userById.get(row.userId);

      const points = row._sum.points || 0;
      const correct = row._sum.correct || 0;
      const totalPicked = row._sum.totalPicked || 0;

      return {
        userId: row.userId,
        position: 0,
        name: user?.displayName || user?.username || "Unknown",
        username: user?.username || "unknown",
        imageUrl: user?.imageUrl || null,
        points,
        correct,
        totalPicked,
        correctPercentage:
          totalPicked === 0 ? 0 : Math.round((correct / totalPicked) * 1000) / 10,
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
      .map((row, index) => ({
        ...row,
        position: index + 1,
      }));
  },
  ["alltime-leaderboard"],
  { revalidate: 30, tags: ["leaderboards"] },
);
