// components/Navbar.tsx
import { signOut } from "@/auth";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function Navbar() {
  const session = await auth();

  const currentUser = session?.user?.id
    ? await prisma.user.findUnique({
        where: {
          id: session.user.id,
        },
        select: {
          username: true,
          displayName: true,
          imageUrl: true,
        },
      })
    : null;

  const shownName =
    currentUser?.displayName ||
    currentUser?.username ||
    session?.user?.name ||
    "Account";

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/picks"
          className="text-2xl font-black italic tracking-tight text-neutral-800"
        >
          Pick Fights
        </Link>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 md:flex">
          <Link
            href="/picks"
            className="text-md font-[1000] text-neutral-700 transition hover:text-neutral-800"
          >
            Submit picks
          </Link>

          <Link
            href="/events"
            className="text-md font-semibold text-gray-700 transition hover:text-neutral-800"
          >
            Events
          </Link>

          <Link
            href="/my-picks"
            className="text-md font-semibold text-gray-700 transition hover:text-neutral-800"
          >
            Pick history
          </Link>

          <Link
            href="/leaderboard"
            className="text-md font-semibold text-gray-700 transition hover:text-neutral-800"
          >
            Gig leaderboard
          </Link>

          {session?.user?.role === "ADMIN" && (
            <Link
              href="/admin"
              className="text-md font-semibold text-gray-700 transition hover:text-neutral-800"
            >
              Admin
            </Link>
          )}
        </div>

        <div className="flex items-center gap-4">
          {session?.user ? (
            <>
              <Link
                href="/account"
                className="flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-1.5 transition hover:bg-neutral-200"
              >
                <Avatar imageUrl={currentUser?.imageUrl} name={shownName} />

                <span className="hidden text-sm font-bold text-neutral-700 sm:inline">
                  {shownName}
                </span>
              </Link>

              <form
                action={async () => {
                  "use server";

                  await signOut({
                    redirectTo: "/login",
                  });
                }}
              >
                <button
                  type="submit"
                  className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-neutral-700"
                >
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-bold text-neutral-700 transition hover:text-neutral-900"
              >
                Log in
              </Link>

              <Link
                href="/signup"
                className="rounded-xl bg-[#2b7fff] px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>

      {session?.user && (
        <div className="border-t border-gray-100 bg-white px-4 py-2 md:hidden">
          <div className="mx-auto grid max-w-md grid-cols-5 gap-2">
            <Link
              href="/picks"
              className="rounded-xl bg-neutral-100 px-3 py-2 text-center text-sm font-black text-neutral-700 transition hover:bg-neutral-200"
            >
              Picks
            </Link>

            <Link
              href="/events"
              className="rounded-xl bg-neutral-100 px-3 py-2 text-center text-sm font-black text-neutral-700 transition hover:bg-neutral-200"
            >
              Events
            </Link>

            <Link
              href="/my-picks"
              className="rounded-xl bg-neutral-100 px-3 py-2 text-center text-sm font-black text-neutral-700 transition hover:bg-neutral-200"
            >
              Mine
            </Link>

            <Link
              href="/leaderboard"
              className="rounded-xl bg-neutral-100 px-3 py-2 text-center text-sm font-black text-neutral-700 transition hover:bg-neutral-200"
            >
              Leaderboard
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function Avatar({
  imageUrl,
  name,
}: {
  imageUrl: string | null | undefined;
  name: string;
}) {
  if (imageUrl) {
    return (
      <span className="h-8 w-8 overflow-hidden rounded-full bg-neutral-200">
        <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-neutral-300 text-xs font-black text-neutral-700">
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
