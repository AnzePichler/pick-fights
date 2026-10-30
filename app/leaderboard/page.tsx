// app/leaderboard/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  getAllTimeLeaderboardRows,
  getEventLeaderboardRows,
  getLeaderboardEvent,
  type LeaderboardRow,
} from "@/lib/leaderboards";
import Navbar from "@/components/Navbar";

export const dynamic = "force-dynamic";

type Scope = "event" | "alltime";

type PageProps = {
  searchParams?: Promise<{
    scope?: string;
  }>;
};

function getUserPicksHref(username: string) {
  return `/users/${encodeURIComponent(username)}/picks`;
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const scope: Scope = params?.scope === "alltime" ? "alltime" : "event";

  const [leaderboardEvent, allTimeRows] = await Promise.all([
    getLeaderboardEvent(),
    scope === "alltime" ? getAllTimeLeaderboardRows() : Promise.resolve([]),
  ]);

  const rows =
    scope === "event"
      ? leaderboardEvent
        ? await getEventLeaderboardRows(leaderboardEvent.id)
        : []
      : allTimeRows;

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-zinc-100 p-6 text-black">
        <section className="mx-auto max-w-6xl">
          <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-4xl font-black tracking-tight">
                  Leaderboard
                </h1>

                <p className="mt-2 text-sm font-semibold text-neutral-500">
                  {scope === "event"
                    ? leaderboardEvent
                      ? `${
                          leaderboardEvent.status === "COMPLETED"
                            ? "Last event"
                            : "Current event"
                        }: ${leaderboardEvent.name}`
                      : "No event selected."
                    : "All-time points across completed events."}
                </p>
              </div>

              <div className="grid grid-cols-2 rounded-2xl bg-neutral-100 p-1">
                <a
                  href="/leaderboard?scope=event"
                  className={`rounded-xl px-5 py-3 text-center text-sm font-black transition ${
                    scope === "event"
                      ? "bg-white text-[#2b7fff] shadow-sm"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  This event
                </a>

                <a
                  href="/leaderboard?scope=alltime"
                  className={`rounded-xl px-5 py-3 text-center text-sm font-black transition ${
                    scope === "alltime"
                      ? "bg-white text-[#2b7fff] shadow-sm"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  All time
                </a>
              </div>
            </div>
          </div>

          {rows.length > 0 && (
            <>
              <div className="md:hidden">
                <LeaderboardMobileCards rows={rows} />
              </div>

              <div className="hidden md:block">
                <LeaderboardTable rows={rows} />
              </div>
            </>
          )}

          {rows.length === 0 && (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
              <h2 className="text-2xl font-black">No leaderboard yet.</h2>
              <p className="mt-2 text-sm font-semibold text-neutral-500">
                Cached scores will show up here after you recalculate event
                scores.
              </p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-400">
              <th className="w-24 px-6 py-4 font-black">Position</th>
              <th className="px-6 py-4 font-black">Player</th>
              <th className="px-6 py-4 text-center font-black">Correct</th>
              <th className="px-6 py-4 text-center font-black">Correct %</th>
              <th className="px-6 py-4 text-right font-black">Points</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={row.userId}
                className="border-b border-neutral-100 last:border-b-0"
              >
                <td className="px-6 py-5">
                  <PositionBadge position={row.position} />
                </td>

                <td className="px-6 py-5">
                  <Link
                    href={getUserPicksHref(row.username)}
                    className="group flex w-fit items-center gap-4 rounded-2xl transition hover:opacity-80"
                  >
                    <Avatar imageUrl={row.imageUrl} name={row.name} />

                    <div>
                      <div className="text-lg font-black text-neutral-800 transition group-hover:text-[#2b7fff]">
                        {row.name}
                      </div>

                      <div className="text-sm font-semibold text-neutral-400">
                        @{row.username}
                      </div>
                    </div>
                  </Link>
                </td>

                <td className="px-6 py-5 text-center">
                  <span className="text-lg font-black text-neutral-800">
                    {row.correct}
                  </span>

                  <span className="text-sm font-bold text-neutral-400">
                    {" "}
                    / {row.totalPicked}
                  </span>
                </td>

                <td className="px-6 py-5 text-center">
                  <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-black text-neutral-700">
                    {row.correctPercentage}%
                  </span>
                </td>

                <td className="px-6 py-5 text-right">
                  <span className="text-2xl font-black text-[#2b7fff]">
                    {row.points}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeaderboardMobileCards({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.userId} className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <Link
              href={getUserPicksHref(row.username)}
              className="group flex min-w-0 items-center gap-3 transition hover:opacity-80"
            >
              <PositionBadge position={row.position} />

              <Avatar imageUrl={row.imageUrl} name={row.name} />

              <div className="min-w-0">
                <div className="truncate text-lg font-black text-neutral-800 transition group-hover:text-[#2b7fff]">
                  {row.name}
                </div>

                <div className="truncate text-sm font-semibold text-neutral-400">
                  @{row.username}
                </div>
              </div>
            </Link>

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
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 text-base font-black text-neutral-700 md:h-12 md:w-12 md:text-lg">
      {label}
    </div>
  );
}

function Avatar({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  if (imageUrl) {
    return (
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-200 md:h-14 md:w-14">
        <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-300 text-sm font-black text-neutral-700 md:h-14 md:w-14 md:text-base">
      {getInitials(name)}
    </span>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
