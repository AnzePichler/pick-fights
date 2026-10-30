// app/admin/AdminResultsForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FightResultStatus =
  | "PENDING"
  | "WINNER"
  | "DRAW"
  | "NO_CONTEST"
  | "CANCELLED";

type FightMethod = "KO_TKO" | "SUBMISSION" | "DECISION";

type Fighter = {
  id: string;
  name: string;
  imageUrl: string | null;
  record: string | null;
};

type AdminFight = {
  id: string;
  order: number;
  fighterA: Fighter;
  fighterB: Fighter;
  result: {
    status: FightResultStatus;
    winnerFighterId: string | null;
    method: FightMethod | null;
    round: number | null;
  } | null;
};

type AdminEvent = {
  id: string;
  name: string;
  status: string;
  fights: AdminFight[];
};

type ResultDraft = {
  fightId: string;
  status: FightResultStatus;
  winnerFighterId: string | null;
  method: FightMethod | null;
  round: number | null;
};

type Props = {
  event: AdminEvent;
};

export default function AdminResultsForm({ event }: Props) {
  const router = useRouter();

  const [results, setResults] = useState<Record<string, ResultDraft>>(() => {
    const initialResults: Record<string, ResultDraft> = {};

    for (const fight of event.fights) {
      initialResults[fight.id] = {
        fightId: fight.id,
        status: fight.result?.status || "PENDING",
        winnerFighterId: fight.result?.winnerFighterId || null,
        method: fight.result?.method || null,
        round: fight.result?.round || null,
      };
    }

    return initialResults;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [dirtyFightIds, setDirtyFightIds] = useState<Set<string>>(new Set());
  const [markCompleted, setMarkCompleted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateFightResult(fightId: string, resultValue: string) {
    setDirtyFightIds((current) => new Set(current).add(fightId));
    setResults((current) => {
      const currentResult = current[fightId];

      if (resultValue.startsWith("WINNER:")) {
        const winnerFighterId = resultValue.replace("WINNER:", "");

        return {
          ...current,
          [fightId]: {
            ...currentResult,
            status: "WINNER",
            winnerFighterId,
          },
        };
      }

      return {
        ...current,
        [fightId]: {
          ...currentResult,
          status: resultValue as FightResultStatus,
          winnerFighterId: null,
          method: null,
          round: null,
        },
      };
    });
  }

  function updateMethod(fightId: string, method: string) {
    setDirtyFightIds((current) => new Set(current).add(fightId));
    setResults((current) => ({
      ...current,
      [fightId]: {
        ...current[fightId],
        method: method ? (method as FightMethod) : null,
      },
    }));
  }

  function updateRound(fightId: string, round: string) {
    setDirtyFightIds((current) => new Set(current).add(fightId));
    setResults((current) => ({
      ...current,
      [fightId]: {
        ...current[fightId],
        round: round ? Number(round) : null,
      },
    }));
  }

  async function saveResults() {
    setIsSaving(true);
    setMessage(null);

    try {
      const changedResults = Object.values(results).filter((draft) => {
        if (!dirtyFightIds.has(draft.fightId)) return false;
        const previous = event.fights.find((fight) => fight.id === draft.fightId)?.result;
        return draft.status !== (previous?.status ?? "PENDING") || draft.winnerFighterId !== (previous?.winnerFighterId ?? null) || draft.method !== (previous?.method ?? null) || draft.round !== (previous?.round ?? null);
      });
      if (!changedResults.length && !markCompleted) {
        setMessage("No result changes to save.");
        return;
      }
      const response = await fetch("/api/admin/results", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: event.id,
          markCompleted,
          results: changedResults,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Failed to save results.");
        return;
      }

      setMessage("Results saved.");
      setDirtyFightIds(new Set());
      router.refresh();
    } catch (error) {
      console.error(error);
      setMessage("Failed to save results.");
    } finally {
      setIsSaving(false);
    }
  }

  const finishedCount = Object.values(results).filter(
    (result) => result.status !== "PENDING",
  ).length;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-black">Fight results</h2>

            <p className="mt-1 text-sm font-semibold text-neutral-500">
              {finishedCount} / {event.fights.length} fights have results.
            </p>
          </div>

          <label className="flex items-center gap-3 rounded-2xl bg-neutral-100 px-4 py-3 text-sm font-bold text-neutral-700">
            <input
              type="checkbox"
              checked={markCompleted}
              onChange={(event) => setMarkCompleted(event.target.checked)}
              className="h-4 w-4"
            />
            Mark event completed
          </label>
        </div>

        {message && (
          <div className="mt-5 rounded-2xl bg-neutral-100 px-4 py-3 text-sm font-bold text-neutral-700">
            {message}
          </div>
        )}
      </div>

      {event.fights.map((fight) => {
        const result = results[fight.id];
        const selectedValue =
          result.status === "WINNER" && result.winnerFighterId
            ? `WINNER:${result.winnerFighterId}`
            : result.status;

        return (
          <div
            key={fight.id}
            className="overflow-hidden rounded-3xl bg-white shadow-sm"
          >
            <div className="border-b border-neutral-100 bg-neutral-50 px-6 py-4">
              <div className="text-xs font-black uppercase tracking-widest text-neutral-400">
                Fight {fight.order}
              </div>

              <div className="mt-1 text-xl font-black text-neutral-800">
                {fight.fighterA.name} vs {fight.fighterB.name}
              </div>
            </div>

            <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <FighterPreview fighter={fight.fighterA} align="left" />

              <div className="text-center text-sm font-black text-neutral-300">
                VS
              </div>

              <FighterPreview fighter={fight.fighterB} align="right" />
            </div>

            <div className="grid gap-4 border-t border-neutral-100 p-6 md:grid-cols-3">
              <label className="space-y-2">
                <span className="text-sm font-black text-neutral-700">
                  Result
                </span>

                <select
                  value={selectedValue}
                  onChange={(event) =>
                    updateFightResult(fight.id, event.target.value)
                  }
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500"
                >
                  <option value="PENDING">Pending</option>
                  <option value={`WINNER:${fight.fighterA.id}`}>
                    {fight.fighterA.name} won
                  </option>
                  <option value={`WINNER:${fight.fighterB.id}`}>
                    {fight.fighterB.name} won
                  </option>
                  <option value="DRAW">Draw</option>
                  <option value="NO_CONTEST">No contest</option>
                  <option value="CANCELLED">Cancelled / did not happen</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-black text-neutral-700">
                  Method
                </span>

                <select
                  value={result.method || ""}
                  onChange={(event) =>
                    updateMethod(fight.id, event.target.value)
                  }
                  disabled={result.status !== "WINNER"}
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 focus:border-blue-500"
                >
                  <option value="">Optional</option>
                  <option value="KO_TKO">KO / TKO</option>
                  <option value="SUBMISSION">Submission</option>
                  <option value="DECISION">Decision</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-black text-neutral-700">
                  Round
                </span>

                <select
                  value={result.round || ""}
                  onChange={(event) =>
                    updateRound(fight.id, event.target.value)
                  }
                  disabled={result.status !== "WINNER"}
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 focus:border-blue-500"
                >
                  <option value="">Optional</option>
                  <option value="1">Round 1</option>
                  <option value="2">Round 2</option>
                  <option value="3">Round 3</option>
                  <option value="4">Round 4</option>
                  <option value="5">Round 5</option>
                </select>
              </label>
            </div>
          </div>
        );
      })}

      <div className="sticky bottom-6 z-40 flex justify-center">
        <button
          type="button"
          onClick={saveResults}
          disabled={isSaving}
          className="rounded-2xl bg-blue-600 px-8 py-4 font-black text-white shadow-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {isSaving ? "Saving..." : "Save results"}
        </button>
      </div>
    </div>
  );
}

function FighterPreview({
  fighter,
  align,
}: {
  fighter: Fighter;
  align: "left" | "right";
}) {
  const isRight = align === "right";

  return (
    <div
      className={`flex items-center gap-4 ${
        isRight ? "justify-end text-right" : "text-left"
      }`}
    >
      {!isRight && <FighterImage fighter={fighter} />}

      <div>
        <div className="text-lg font-black text-neutral-800">
          {fighter.name}
        </div>

        <div className="text-sm font-semibold text-neutral-400">
          {fighter.record || "Record unavailable"}
        </div>
      </div>

      {isRight && <FighterImage fighter={fighter} />}
    </div>
  );
}

function FighterImage({ fighter }: { fighter: Fighter }) {
  return (
    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-neutral-100">
      <img
        src={fighter.imageUrl || "/fighter-placeholder.png"}
        alt={fighter.name}
        className="h-full w-full object-cover object-top"
      />
    </div>
  );
}
