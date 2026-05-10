// components/Navbar.tsx
import { signOut } from "@/auth";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
        <a
          href="/picks"
          className="text-2xl font-black italic tracking-tight text-neutral-800"
        >
          Pick Fights
        </a>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex">
          <a
            href="/picks"
            className="text-lg font-[1000] text-neutral-700 transition hover:text-neutral-800"
          >
            Make picks
          </a>

          <a
            href="/my-picks"
            className="text-lg font-semibold text-gray-700 transition hover:text-neutral-800"
          >
            My picks
          </a>

          <a
            href="/leaderboard"
            className="text-lg font-semibold text-gray-700 transition hover:text-neutral-800"
          >
            Leaderboard
          </a>

          <a
            href="/account"
            className="text-lg font-semibold text-gray-700 transition hover:text-neutral-800"
          >
            Account
          </a>

          {session?.user?.role === "ADMIN" && (
            <a
              href="/admin"
              className="text-lg font-semibold text-gray-700 transition hover:text-neutral-800"
            >
              Admin
            </a>
          )}
        </div>

        <div className="flex items-center gap-4">
          {session?.user ? (
            <>
              <a
                href="/account"
                className="flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-1.5 transition hover:bg-neutral-200"
              >
                <Avatar imageUrl={currentUser?.imageUrl} name={shownName} />

                <span className="hidden text-sm font-bold text-neutral-700 sm:inline">
                  {shownName}
                </span>
              </a>

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
              <a
                href="/login"
                className="text-sm font-bold text-neutral-700 transition hover:text-neutral-900"
              >
                Log in
              </a>

              <a
                href="/signup"
                className="rounded-xl bg-[#2b7fff] px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                Sign up
              </a>
            </>
          )}
        </div>
      </nav>

      {session?.user && (
        <div className="border-t border-gray-100 bg-white px-4 py-2 md:hidden">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
            <a
              href="/picks"
              className="rounded-xl bg-neutral-100 px-3 py-2 text-center text-sm font-black text-neutral-700 transition hover:bg-neutral-200"
            >
              Picks
            </a>

            <a
              href="/my-picks"
              className="rounded-xl bg-neutral-100 px-3 py-2 text-center text-sm font-black text-neutral-700 transition hover:bg-neutral-200"
            >
              Mine
            </a>

            <a
              href="/leaderboard"
              className="rounded-xl bg-neutral-100 px-3 py-2 text-center text-sm font-black text-neutral-700 transition hover:bg-neutral-200"
            >
              Leaderboard
            </a>

            <a
              href="/account"
              className="rounded-xl bg-neutral-100 px-3 py-2 text-center text-sm font-black text-neutral-700 transition hover:bg-neutral-200"
            >
              Account
            </a>
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
