// app/test-event/admin/page.tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import AdminResultsForm from "@/app/admin/AdminResultsForm";

export const dynamic = "force-dynamic";

export default async function TestEventAdminPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      role: true,
    },
  });

  if (currentUser?.role !== "ADMIN") {
    redirect("/picks");
  }

  const event = await prisma.event.findUnique({
    where: {
      slug: "ufc-test",
    },
    include: {
      fights: {
        include: {
          fighterA: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              record: true,
            },
          },
          fighterB: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
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
    },
  });

  if (!event) {
    return (
      <>
        <Navbar />

        <main className="min-h-screen bg-zinc-100 p-6 text-black">
          <section className="mx-auto max-w-5xl rounded-3xl bg-white p-8 shadow-sm">
            <h1 className="text-3xl font-black">No test event found.</h1>
            <p className="mt-2 text-neutral-500">
              Create a DRAFT event with slug{" "}
              <span className="font-black">ufc-test</span>.
            </p>
          </section>
        </main>
      </>
    );
  }

  const adminEvent = {
    id: event.id,
    name: event.name,
    status: event.status,
    fights: event.fights.map((fight) => ({
      id: fight.id,
      order: fight.order,
      fighterA: fight.fighterA,
      fighterB: fight.fighterB,
      result: fight.result,
    })),
  };

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-zinc-100 p-6 text-black">
        <section className="mx-auto max-w-5xl">
          <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
            <div className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-black uppercase tracking-widest text-yellow-700">
              Test admin
            </div>

            <h1 className="mt-3 text-4xl font-black tracking-tight">
              Test Results
            </h1>

            <p className="mt-2 text-sm font-semibold text-neutral-500">
              Input dummy results for {event.name}. This is for testing UI and
              scoring only.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="/test-event"
                className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-black text-neutral-700"
              >
                Back to test picks
              </a>

              <a
                href="/test-event/leaderboard"
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-black text-white"
              >
                View test leaderboard
              </a>
            </div>
          </div>

          <AdminResultsForm event={adminEvent} />
        </section>
      </main>
    </>
  );
}
