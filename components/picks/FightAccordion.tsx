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
                fighterAId={fight.fighterA.id}
                fighterBId={fight.fighterB.id}
                fighterAName={fight.fighterA.name}
                fighterBName={fight.fighterB.name}
                result={fight.result}
                picks={communityPicks[fight.id]}
              />
            )}
          </div>
        ))}
      </div>

      {locked && canViewOthers ? (
        <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 md:bottom-8 md:w-auto">
          <a
            href={view === "others" ? "/picks" : "/picks?view=others"}
            className="block w-full rounded-2xl bg-blue-600 px-6 py-4 text-center font-bold text-white shadow-lg transition hover:bg-blue-700 md:w-auto"
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
  fighterAId,
  fighterBId,
  fighterAName,
  fighterBName,
  result,
  picks,
}: {
  fighterAId: string;
  fighterBId: string;
  fighterAName: string;
  fighterBName: string;
  result?: {
    status: "PENDING" | "WINNER" | "DRAW" | "NO_CONTEST" | "CANCELLED";
    winnerFighterId: string | null;
  } | null;
  picks?: FightCommunityPicks;
}) {
  const fighterAPicks = picks?.fighterA || [];
  const fighterBPicks = picks?.fighterB || [];
  const total = fighterAPicks.length + fighterBPicks.length;

  const fighterAPercent =
    total === 0 ? 0 : Math.round((fighterAPicks.length / total) * 100);

  const fighterBPercent =
    total === 0 ? 0 : Math.round((fighterBPicks.length / total) * 100);

  const resultStatus = result?.status;
  const hasResult = resultStatus && resultStatus !== "PENDING";

  const isDrawLike =
    resultStatus === "DRAW" ||
    resultStatus === "NO_CONTEST" ||
    resultStatus === "CANCELLED";

  const fighterAOutcome = getCommunityOutcome({
    fighterId: fighterAId,
    winnerFighterId: result?.winnerFighterId || null,
    hasResult: Boolean(hasResult),
    isDrawLike,
  });

  const fighterBOutcome = getCommunityOutcome({
    fighterId: fighterBId,
    winnerFighterId: result?.winnerFighterId || null,
    hasResult: Boolean(hasResult),
    isDrawLike,
  });

  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm md:px-5 md:py-4">
      <div className="grid grid-cols-2 gap-3 md:gap-5">
        <PickGroup
          name={fighterAName}
          users={fighterAPicks}
          percent={fighterAPercent}
          align="left"
          outcome={fighterAOutcome}
        />

        <PickGroup
          name={fighterBName}
          users={fighterBPicks}
          percent={fighterBPercent}
          align="right"
          outcome={fighterBOutcome}
        />
      </div>
    </div>
  );
}

function getCommunityOutcome({
  fighterId,
  winnerFighterId,
  hasResult,
  isDrawLike,
}: {
  fighterId: string;
  winnerFighterId: string | null;
  hasResult: boolean;
  isDrawLike: boolean;
}) {
  if (!hasResult) return "pending";
  if (isDrawLike) return "draw";
  if (winnerFighterId === fighterId) return "winner";

  return "loser";
}

function PickGroup({
  name,
  users,
  percent,
  align,
  outcome,
}: {
  name: string;
  users: CommunityPickUser[];
  percent: number;
  align: "left" | "right";
  outcome: "pending" | "winner" | "loser" | "draw";
}) {
  const isRight = align === "right";
  const shownUsers = users.slice(0, 4);
  const extraCount = users.length - shownUsers.length;

  const directionClass = isRight ? "bg-gradient-to-l" : "bg-gradient-to-r";

  const outcomeGradient =
    outcome === "winner"
      ? `${directionClass} from-green-500 via-transparent to-transparent`
      : outcome === "loser"
        ? `${directionClass} from-red-500 via-transparent to-transparent`
        : outcome === "draw"
          ? `${directionClass} from-neutral-500 via-transparent to-transparent`
          : "bg-transparent";

  const outcomeLabel =
    outcome === "winner"
      ? "WON"
      : outcome === "loser"
        ? "LOST"
        : outcome === "draw"
          ? "NO WINNER"
          : null;

  const outcomeBadgeClass =
    outcome === "winner"
      ? "bg-green-100 text-green-700"
      : outcome === "loser"
        ? "bg-red-100 text-red-700"
        : "bg-neutral-100 text-neutral-600";

  return (
    <div className={`rounded-2xl p-[2px] ${outcomeGradient}`}>
      <div
        className={`min-w-0 rounded-[0.9rem] bg-white px-2.5 py-2 ${
          isRight ? "text-right" : "text-left"
        }`}
      >
        <div
          className={`flex items-center gap-2 ${
            isRight ? "justify-end" : "justify-start"
          }`}
        >
          {!isRight && outcomeLabel && (
            <div
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${outcomeBadgeClass}`}
            >
              {outcomeLabel}
            </div>
          )}

          <div className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400 md:text-xs">
            Picked {name}
          </div>

          {isRight && outcomeLabel && (
            <div
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${outcomeBadgeClass}`}
            >
              {outcomeLabel}
            </div>
          )}
        </div>

        <div
          className={`mt-2 flex items-center gap-2 ${
            isRight ? "justify-end" : "justify-start"
          }`}
        >
          <div
            className={`flex min-w-0 shrink items-center gap-1 ${
              isRight ? "justify-end" : "justify-start"
            }`}
          >
            {shownUsers.map((user) => (
              <Avatar key={user.id} user={user} />
            ))}

            {extraCount > 0 && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-black text-neutral-600 md:h-9 md:w-9 md:text-xs">
                +{extraCount}
              </div>
            )}
          </div>

          <div className="shrink-0 leading-tight">
            <div className="text-xs font-black text-neutral-800 md:text-sm">
              {users.length}
            </div>
            <div className="text-xs font-bold text-blue-600 md:text-sm">
              {percent}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar({ user }: { user: CommunityPickUser }) {
  return (
    <div
      title={user.isYou ? `${user.name} (You)` : user.name}
      className={`h-7 w-7 shrink-0 overflow-hidden rounded-full bg-neutral-200 md:h-9 md:w-9 ${
        user.isYou ? "ring-2 ring-blue-500" : ""
      }`}
    >
      {user.imageUrl ? (
        <img
          src={user.imageUrl}
          alt={user.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] font-black text-neutral-700 md:text-xs">
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
