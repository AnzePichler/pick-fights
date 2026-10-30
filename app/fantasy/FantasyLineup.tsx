"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FANTASY_SLOTS, eligibleFantasyFighters, scoreFantasyChoice,
  type FantasyChoice, type FantasyFight, type FantasyFighter, type FantasySlotId,
} from "@/lib/fantasy";
import FighterPicker from "./FighterPicker";
import FighterPortrait from "./FighterPortrait";
import styles from "./lineup.module.css";

const POSITIONS = [[33, 29], [67, 29], [19, 73], [50, 73], [81, 73]];

function lineupKey(choices: FantasyChoice[]) {
  return JSON.stringify(FANTASY_SLOTS.map((slot) => {
    const choice = choices.find((item) => item.slot === slot.id);
    return choice ? [choice.fightId, choice.fighterId] : null;
  }));
}

function outcomeText(choice: FantasyChoice, fight: FantasyFight | undefined, fighters: FantasyFighter[]) {
  if (!fight) return "Fight unavailable. No points.";
  if (fight.status !== "ACTIVE") return "Fight cancelled or replaced. No points.";
  const result = fight.result;
  if (!result || result.status === "PENDING") return "Awaiting fight result.";
  if (result.status === "DRAW") return "Draw. No points.";
  if (result.status === "NO_CONTEST") return "No contest. No points.";
  if (result.status !== "WINNER") return "Fight cancelled. No points.";
  const method = result.method === "KO_TKO" ? "KO/TKO" : result.method === "SUBMISSION" ? "submission" : result.method === "DECISION" ? "decision" : null;
  if (result.winnerFighterId !== choice.fighterId) {
    const winner = fighters.find((fighter) => fighter.id === result.winnerFighterId && fighter.fightId === fight.id);
    return `Lost. ${winner?.name ?? "Opponent"} won${method ? ` by ${method}` : ""}.`;
  }
  const score = scoreFantasyChoice(choice, fight);
  return `Won${method ? ` by ${method}` : ""}. ${score === null ? "Waiting for method confirmation." : score > 0 ? "Slot condition met." : "Slot condition missed — no points."}`;
}

export default function FantasyLineup({ event, initialNow, initialChoices, fighters, fights }: {
  event: { id: string; name: string; status: string; lockAt: string };
  initialNow: number;
  initialChoices: FantasyChoice[];
  fighters: FantasyFighter[];
  fights: FantasyFight[];
}) {
  const router = useRouter();
  const [choices, setChoices] = useState(initialChoices);
  const [savedChoices, setSavedChoices] = useState(initialChoices);
  const [now, setNow] = useState(initialNow);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pickingSlot, setPickingSlot] = useState<FantasySlotId | null>(null);
  const pickerDialog = useRef<HTMLDialogElement>(null);
  const remaining = Math.max(0, new Date(event.lockAt).getTime() - now);
  const closed = event.status !== "OPEN" || remaining === 0;
  const displayedChoices = closed ? savedChoices : choices;
  const dirty = lineupKey(choices) !== lineupKey(savedChoices);
  const activeFightIds = new Set(fights.filter((fight) => fight.status === "ACTIVE").map((fight) => fight.id));
  const activeFighters = fighters.filter((fighter) => activeFightIds.has(fighter.fightId));
  const total = savedChoices.reduce((points, choice) => points + (scoreFantasyChoice(choice, fights.find((fight) => fight.id === choice.fightId)) ?? 0), 0);
  const settledSlots = savedChoices.filter((choice) => scoreFantasyChoice(choice, fights.find((fight) => fight.id === choice.fightId)) !== null).length;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (pickingSlot && !closed) pickerDialog.current?.showModal();
    else pickerDialog.current?.close();
  }, [pickingSlot, closed]);

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 30_000);
    const refreshOnFocus = () => router.refresh();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [router]);

  function selectFighter(slot: FantasySlotId, fighterId: string) {
    if (closed || saving) return;
    const fighter = eligibleFantasyFighters(slot, activeFighters, choices).find((item) => item.id === fighterId);
    if (fighterId && !fighter) return;
    setChoices((current) => [
      ...current.filter((choice) => choice.slot !== slot),
      ...(fighter ? [{ slot, fightId: fighter.fightId, fighterId: fighter.id }] : []),
    ]);
    setError("");
    setPickingSlot(null);
    document.getElementById(`${slot}-choose`)?.focus();
  }

  function closePicker(slot: FantasySlotId) {
    setPickingSlot(null);
    document.getElementById(`${slot}-choose`)?.focus();
  }

  async function saveLineup() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/fantasy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, choices }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save your lineup.");
      setSavedChoices(choices);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your lineup.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wider text-neutral-500">Fantasy · Five fighters · 300 points</p>
        <h1 className="mt-2 text-3xl font-black">{event.name}</h1>
        <p className="mt-3 font-semibold">{event.status === "COMPLETED" ? "Event complete · Lineup locked" : closed ? "Lineup locked" : `Locks in ${Math.floor(remaining / 3600000)}h ${Math.floor(remaining / 60000) % 60}m ${Math.floor(remaining / 1000) % 60}s`}</p>
        <p className="mt-2 text-sm text-neutral-600">Five fighters from five different fights. Meet the slot condition to score — otherwise, zero.</p>
        {closed && <p className="mt-4 text-2xl font-black">{total} / 300 points <span className="text-sm font-medium text-neutral-500">· {settledSlots}/{savedChoices.length} slots settled</span></p>}
        {closed && savedChoices.length === 0 && <p className="mt-2 text-sm">No lineup was saved for this event.</p>}
        {closed && dirty && <p className="mt-2 text-sm text-red-700">Unsaved changes did not enter. Showing your last saved lineup.</p>}
      </header>

      <div className={styles.field} aria-label="Fantasy lineup">
        <div className={styles.fieldTop}><span>PF / FANTASY</span><span>{closed ? "LINEUP LOCKED" : "YOUR LINEUP"}</span></div>
        <svg className={styles.lines} viewBox="0 0 1000 800" aria-hidden="true">
          <polygon points="280,62 720,62 950,270 950,550 720,750 280,750 50,550 50,270" />
          <polygon points="292,88 708,88 924,282 924,538 708,724 292,724 76,538 76,282" />
          <polygon points="304,114 696,114 898,294 898,526 696,698 304,698 102,526 102,294" className={styles.innerLine} />
          <text x="500" y="443" textAnchor="middle" className={styles.brand}>PICKFIGHTS</text>
        </svg>
        {FANTASY_SLOTS.map((slot, index) => {
          const choice = displayedChoices.find((item) => item.slot === slot.id);
          const selected = fighters.find((fighter) => fighter.id === choice?.fighterId && fighter.fightId === choice?.fightId);
          const score = choice ? scoreFantasyChoice(choice, fights.find((fight) => fight.id === choice.fightId)) : null;
          const [left, top] = POSITIONS[index];
          return <section key={slot.id} className={styles.slot} style={{ left: `${left}%`, top: `${top}%` }}>
            <button id={`${slot.id}-choose`} type="button" className={styles.choose} disabled={closed || saving}
              aria-label={`${slot.label}${slot.id.startsWith("FINISH") ? ` ${index}` : ""}: ${selected?.name ?? "Choose fighter"}`}
              aria-haspopup="dialog" aria-expanded={pickingSlot === slot.id}
              title={`${slot.condition} · ${slot.points} pts`}
              onClick={() => setPickingSlot(slot.id)}>
              <span className={styles.role}>{slot.label}{slot.id === "CAPTAIN" && <span className={styles.captain}>C</span>}</span>
              <span className={`${styles.figure} ${!selected ? styles.empty : ""}`}>
                {selected ? <FighterPortrait key={selected.id + (selected.imageUrl ?? "")} fighter={selected} /> : <span className={styles.plus} aria-hidden="true">+</span>}
              </span>
              <span className={styles.namePlate}>
                <span className={styles.name}>{selected?.name ?? "Choose fighter"}</span>
                <span className={`${styles.detail} ${closed && choice && score !== null ? score > 0 ? styles.scored : styles.missed : ""}`}>
                  {closed ? !choice ? "Not entered" : score === null ? "Pending" : `${score > 0 ? "+" : ""}${score} pts` : `${slot.points} pts · ${slot.id === "UNDERDOG" ? "Win · > +100" : slot.id === "DECISION" ? "Decision" : slot.id === "CAPTAIN" ? "Win" : "KO / SUB"}`}
                </span>
              </span>
            </button>
            {!closed && choice && <button type="button" className={styles.remove} disabled={saving} aria-label={`Remove ${selected?.name ?? "fighter"} from ${slot.label}`} onClick={() => selectFighter(slot.id, "")}>Remove</button>}
          </section>;
        })}
        <div className={styles.fieldBottom}><span>5 FIGHTERS. ONE TEAM.</span><span>PICKFIGHTS</span></div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 px-1 text-xs text-neutral-500">
        {FANTASY_SLOTS.filter((slot) => slot.id !== "FINISH_TWO").map((slot) => <p key={slot.id}><strong className="text-neutral-700">{slot.label}{slot.id === "FINISH_ONE" ? " ×2" : ""}:</strong> {slot.condition} · {slot.points} pts</p>)}
      </div>

      <dialog ref={pickerDialog} className={styles.dialog} aria-label="Choose a fantasy fighter"
        onCancel={() => setPickingSlot(null)} onClose={() => setPickingSlot(null)}
        onClick={(event) => { if (event.target === event.currentTarget && pickingSlot) closePicker(pickingSlot); }}>
        {pickingSlot && !closed && <div className="p-4">
          <h2 className="px-3 pt-2 text-xl font-black">{FANTASY_SLOTS.find((slot) => slot.id === pickingSlot)?.label}</h2>
          <p className="px-3 pt-2 text-xs text-neutral-500">One fighter per fight. Underdog requires odds greater than +100.</p>
          <FighterPicker key={pickingSlot} slotLabel={FANTASY_SLOTS.find((slot) => slot.id === pickingSlot)!.label}
            fighters={eligibleFantasyFighters(pickingSlot, activeFighters, choices)}
            selectedId={choices.find((choice) => choice.slot === pickingSlot)?.fighterId} disabled={saving}
            onSelect={(fighterId) => selectFighter(pickingSlot, fighterId)} onClose={() => closePicker(pickingSlot)} />
        </div>}
      </dialog>

      {!closed && <footer className="sticky bottom-4 mt-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm font-semibold">{choices.length}/5 selected · {saving ? "Saving…" : dirty ? "Unsaved changes" : savedChoices.length === 5 ? "Lineup saved" : "Build your lineup"}</p>
          <button type="button" disabled={saving || choices.length !== 5 || !dirty} onClick={saveLineup}
            className="rounded-xl bg-[#2b7fff] px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Saving…" : "Save lineup"}</button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
      </footer>}
      {closed && <section className="mt-6 rounded-3xl bg-white p-6">
        <h2 className="font-black">Slot results</h2>
        <ul className="mt-3 space-y-3">{FANTASY_SLOTS.map((slot, index) => {
          const choice = savedChoices.find((item) => item.slot === slot.id);
          return <li key={slot.id} className="text-sm"><strong>{slot.label}{slot.id.startsWith("FINISH") ? ` ${index}` : ""}: </strong>{choice ? outcomeText(choice, fights.find((fight) => fight.id === choice.fightId), fighters) : "Not entered"}</li>;
        })}</ul>
      </section>}
      {closed && error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </>
  );
}
