import { prisma } from "@/lib/prisma";
import FightAccordion from "@/components/picks/FightAccordion";
import Navbar from "@/components/Navbar";

export const dynamic = "force-dynamic";

export default async function TestEventPage() {
  const event = await prisma.event.findFirst({
    where: {
      slug: "ufc-328",
    },
    include: {
      fights: {
        include: {
          fighterA: true,
          fighterB: true,
        },
        orderBy: {
          order: "asc",
        },
      },
    },
  });

  if (!event) {
    return <div>Event not found.</div>;
  }

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-zinc-100 p-6 text-black">
        <section className="mx-auto max-w-5xl">
          <FightAccordion eventId={event.id} fights={event.fights} />
        </section>
      </main>
    </>
  );
}
