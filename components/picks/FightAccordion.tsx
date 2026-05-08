// components/picks/FightAccordion.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import FightCard from "./FightCard";
import SubmitPicksButton from "./SubmitPicksButton";
import type { Fight, PickDraft } from "../../types/types";

type Props = {
  eventId: string;
  fights: Fight[];
  initialPicks?: Record<string, PickDraft>;
  isLocked?: boolean;
};

export default function FightAccordion({
  eventId,
  fights,
  initialPicks = {},
  isLocked = false,
}: Props) {
  const router = useRouter();

  const [selectedPicks, setSelectedPicks] =
    useState<Record<string, PickDraft>>(initialPicks);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  function selectFighter(fightId: string, fighterId: string) {
    if (isLocked || hasSubmitted || isSubmitting) {
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
    if (isLocked || hasSubmitted || isSubmitting) {
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

  return (
    <>
      <div className="space-y-5 pb-32">
        {fights.map((fight) => (
          <FightCard
            key={fight.id}
            fight={fight}
            selectedFighterId={selectedPicks[fight.id]?.fighterId}
            onSelectFighter={selectFighter}
            isLocked={isLocked || hasSubmitted}
          />
        ))}
      </div>

      <SubmitPicksButton
        pickedCount={pickedCount}
        totalFights={totalFights}
        disabled={!allPicksMade || isSubmitting || hasSubmitted || isLocked}
        isSubmitting={isSubmitting}
        isLocked={isLocked || hasSubmitted}
        onSubmit={submitPicks}
      />
    </>
  );
}
