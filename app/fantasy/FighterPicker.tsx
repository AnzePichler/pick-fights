"use client";

import { useEffect, useRef, useState } from "react";
import type { FantasyFighter } from "@/lib/fantasy";
import FighterPortrait from "./FighterPortrait";

export default function FighterPicker({ slotLabel, fighters, selectedId, disabled, onSelect, onClose }: {
  slotLabel: string;
  fighters: FantasyFighter[];
  selectedId?: string;
  disabled: boolean;
  onSelect: (fighterId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const filteredFighters = fighters.filter((fighter) =>
    fighter.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  useEffect(() => {
    searchInput.current?.focus();
  }, []);

  return (
    <div role="region" aria-label={`Choose a fighter for ${slotLabel}`} className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3"
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-bold">Choose a fighter</p>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold hover:bg-neutral-200">Close</button>
      </div>
      <label className="mb-3 block">
        <span className="sr-only">Search fighters for {slotLabel}</span>
        <input ref={searchInput} value={search} onChange={(event) => setSearch(event.target.value)} disabled={disabled}
          placeholder="Search fighter names" className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm" />
      </label>
      <ul className="grid max-h-80 gap-2 overflow-y-auto">
        {filteredFighters.map((fighter) => (
          <li key={`${fighter.fightId}-${fighter.id}`}>
            <button type="button" aria-label={`Select ${fighter.name}`} aria-pressed={fighter.id === selectedId} disabled={disabled}
              onClick={() => onSelect(fighter.id)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition disabled:opacity-50 ${fighter.id === selectedId ? "border-neutral-900 bg-neutral-100" : "border-neutral-200 bg-white hover:border-neutral-500"}`}>
              <span aria-hidden="true" className="flex h-14 w-12 shrink-0 items-start justify-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-300 [&>img]:h-24 [&>img]:w-auto [&>img]:max-w-none [&>svg]:h-16 [&>svg]:w-auto">
                <FighterPortrait key={fighter.id} fighter={fighter} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-black">{fighter.name}</span>
                <span className="block text-xs text-neutral-500">Opponent: {fighter.opponent}</span>
              </span>
              <span className="shrink-0 text-right text-xs font-bold">
                {fighter.odds === null ? "No odds" : `${fighter.odds > 0 ? "+" : ""}${fighter.odds}`}
                {fighter.isUnderdog && <span className="mt-1 block text-orange-700">Underdog</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {filteredFighters.length === 0 && <p className="py-3 text-sm text-neutral-600">No fighters match your search.</p>}
    </div>
  );
}
