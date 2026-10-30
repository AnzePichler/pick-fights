// app/admin/page.tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import AdminResultsForm from "./AdminResultsForm";
import SyncSettings from "./SyncSettings";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/picks");
  }

  const event = await prisma.event.findFirst({
    where: {
      isActive: true,
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
              source: true,
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
            <h1 className="text-3xl font-black">Admin</h1>
            <p className="mt-2 text-neutral-500">
              No active event found. Mark an event as active first.
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
            <h1 className="text-4xl font-black tracking-tight">Admin</h1>

            <p className="mt-2 text-sm font-semibold text-neutral-500">
              Input fight results for {event.name}.
            </p>
          </div>

          {event.slug !== "ufc-test" && <SyncSettings event={{
            id: event.id, startsAt: event.startsAt.toISOString(), providerEventId: event.providerEventId,
            syncEnabled: event.syncEnabled, lastSyncAt: event.lastSyncAt?.toISOString() ?? null,
            nextSyncAt: event.nextSyncAt?.toISOString() ?? null, lastSyncError: event.lastSyncError,
            fights: event.fights.filter((fight) => fight.status === "ACTIVE").map((fight) => ({
              id: fight.id, fighterA: fight.fighterA.name, fighterB: fight.fighterB.name, manual: fight.result?.source === "MANUAL",
            })),
          }} />}
          <AdminResultsForm key={event.resultVersion} event={adminEvent} />
        </section>
      </main>
    </>
  );
}
