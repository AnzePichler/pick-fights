// components/picks/FightAccordion.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import FightCard from "./FightCard";
import SubmitPicksButton from "./SubmitPicksButton";
import type { Fight, PickDraft } from "../../types/types";

type CommunityPickUser = {
  id: string;
  name: string;
  imageUrl: string | null;
  isYou: boolean;
};

type FightCommunityPicks = {
  fighterA: CommunityPickUser[];
  fighterB: CommunityPickUser[];
};

type Props = {
  eventId: string;
  fights: Fight[];
  initialPicks?: Record<string, PickDraft>;
  isLocked?: boolean;
  view?: "mine" | "others";
  canViewOthers?: boolean;
  communityPicks?: Record<string, FightCommunityPicks>;
};

export default function FightAccordion({
  eventId,
  fights,
  initialPicks = {},
  isLocked = false,
  view = "mine",
  canViewOthers = false,
  communityPicks = {},
}: Props) {
  const router = useRouter();

  const [selectedPicks, setSelectedPicks] =
    useState<Record<string, PickDraft>>(initialPicks);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  function selectFighter(fightId: string, fighterId: string) {
    if (isLocked || hasSubmitted || isSubmitting || view === "others") {
      return;
    }

    setSelectedPicks((current) => {
      const alreadySelected = current[fightId]?.fighterId === fighterId;

      if (alreadySelected) {
        const updated = { ...current };
        delete updated[fightId];
        return updated;
      }

      return {
        ...current,
        [fightId]: {
          fighterId,
        },
      };
    });
  }

  async function submitPicks() {
    if (isLocked || hasSubmitted || isSubmitting || view === "others") {
      return;
    }

    const choices = Object.entries(selectedPicks).map(([fightId, pick]) => ({
      fightId,
      pickedFighterId: pick.fighterId,
    }));

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/picks/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          choices,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to submit picks.");
        return;
      }

      setHasSubmitted(true);
      alert("Picks submitted and locked!");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Failed to submit picks.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const totalFights = fights.length;
  const pickedCount = Object.keys(selectedPicks).length;
  const allPicksMade = pickedCount === totalFights;
  const locked = isLocked || hasSubmitted;

  return (
    <>
      <div className="space-y-5 pb-32">
        {fights.map((fight) => (
          <div key={fight.id} className="space-y-3">
            <FightCard
              fight={fight}
              selectedFighterId={
                view === "others"
                  ? undefined
                  : selectedPicks[fight.id]?.fighterId
              }
              onSelectFighter={selectFighter}
              isLocked={locked || view === "others"}
            />

            {view === "others" && (
              <OthersPickRow
                fighterAName={fight.fighterA.name}
                fighterBName={fight.fighterB.name}
                picks={communityPicks[fight.id]}
              />
            )}
          </div>
        ))}
      </div>

      {locked && canViewOthers ? (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2">
          <a
            href={view === "others" ? "/picks" : "/picks?view=others"}
            className="block rounded-2xl bg-blue-600 px-6 py-4 text-center font-bold text-white shadow-lg transition hover:bg-blue-700"
          >
            {view === "others" ? "Back to My Picks" : "See Everyone's Picks"}
          </a>
        </div>
      ) : (
        <SubmitPicksButton
          pickedCount={pickedCount}
          totalFights={totalFights}
          disabled={!allPicksMade || isSubmitting || locked}
          isSubmitting={isSubmitting}
          isLocked={locked}
          onSubmit={submitPicks}
        />
      )}
    </>
  );
}

function OthersPickRow({
  fighterAName,
  fighterBName,
  picks,
}: {
  fighterAName: string;
  fighterBName: string;
  picks?: FightCommunityPicks;
}) {
  const fighterAPicks = picks?.fighterA || [];
  const fighterBPicks = picks?.fighterB || [];
  const total = fighterAPicks.length + fighterBPicks.length;

  const fighterAPercent =
    total === 0 ? 0 : Math.round((fighterAPicks.length / total) * 100);

  const fighterBPercent =
    total === 0 ? 0 : Math.round((fighterBPicks.length / total) * 100);

  return (
    <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
      <div className="grid gap-5 md:grid-cols-2">
        <PickGroup
          name={fighterAName}
          users={fighterAPicks}
          percent={fighterAPercent}
          align="left"
        />

        <PickGroup
          name={fighterBName}
          users={fighterBPicks}
          percent={fighterBPercent}
          align="right"
        />
      </div>
    </div>
  );
}

function PickGroup({
  name,
  users,
  percent,
  align,
}: {
  name: string;
  users: CommunityPickUser[];
  percent: number;
  align: "left" | "right";
}) {
  const isRight = align === "right";
  const shownUsers = users.slice(0, 5);
  const extraCount = users.length - shownUsers.length;

  return (
    <div className={isRight ? "text-right" : "text-left"}>
      <div className="text-xs font-black uppercase tracking-widest text-neutral-400">
        Picked {name}
      </div>

      <div
        className={`mt-3 flex items-center gap-4 ${
          isRight ? "justify-end" : "justify-start"
        }`}
      >
        <div
          className={`flex shrink-0 items-center gap-2 ${
            isRight ? "justify-end" : "justify-start"
          }`}
        >
          {shownUsers.map((user) => (
            <Avatar key={user.id} user={user} />
          ))}

          {extraCount > 0 && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white bg-neutral-100 text-xs font-black text-neutral-600 shadow-sm">
              +{extraCount}
            </div>
          )}
        </div>

        <div className="shrink-0">
          <div className="text-sm font-black text-neutral-800">
            {users.length} {users.length === 1 ? "pick" : "picks"}
          </div>
          <div className="text-sm font-bold text-blue-600">{percent}%</div>
        </div>
      </div>
    </div>
  );
}

function Avatar({ user }: { user: CommunityPickUser }) {
  return (
    <div
      title={user.isYou ? `${user.name} (You)` : user.name}
      className={`h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-200 ${
        user.isYou ? "ring-3 ring-blue-500" : ""
      }`}
    >
      {user.imageUrl ? (
        <img
          src={user.imageUrl}
          alt={user.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs font-black text-neutral-700">
          {getInitials(user.name)}
        </div>
      )}
    </div>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
