// app/account/page.tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import AccountForm from "./AccountForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      email: true,
      username: true,
      displayName: true,
      imageUrl: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-zinc-100 p-6 text-black">
        <section className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-sm">
          <div className="mb-10">
            <h1 className="text-3xl font-black tracking-tight">Account</h1>
            <p className="mt-2 text-sm font-semibold text-neutral-500">
              Change your display name and profile picture.
            </p>
          </div>

          <AccountForm user={user} />
        </section>
      </main>
    </>
  );
}
