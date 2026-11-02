"use client";

import type { PickDraft } from "@/types/types";
import type { PicksFight } from "./types";
import s from "./finish-picker.module.css";

type Method = NonNullable<PickDraft["method"]>;
type State = "idle" | "picked" | "correct" | "wrong" | "actual" | "void";
type Props = {
  pick?: PickDraft;
  result?: PicksFight["result"];
  isLocked: boolean;
  onChange: (pick: PickDraft) => void;
};

const methods: { value: Method; label: string; name: string }[] = [
  { value: "KO_TKO", label: "KO", name: "Knockout or technical knockout" },
  { value: "SUBMISSION", label: "SUB", name: "Submission" },
  { value: "DECISION", label: "DEC", name: "Decision" },
];
const usesRound = (method: Method | null | undefined) => method === "KO_TKO" || method === "SUBMISSION";

function optionState(picked: boolean, actual: boolean, known: boolean, voided: boolean): State {
  if (voided) return picked ? "void" : "idle";
  if (!known) return picked ? "picked" : "idle";
  if (picked) return actual ? "correct" : "wrong";
  return actual ? "actual" : "idle";
}

const stateLabels: Record<State, string> = {
  idle: "Not selected",
  picked: "Your pick, awaiting result",
  correct: "Your pick, correct",
  wrong: "Your pick, wrong",
  actual: "Actual result",
  void: "Your pick, no winner",
};

export default function FinishPicker({ pick, result, isLocked, onChange }: Props) {
  const hasWinner = result?.status === "WINNER";
  const voided = Boolean(result && result.status !== "PENDING" && result.status !== "WINNER");
  const methodKnown = hasWinner && Boolean(result.method);
  const roundKnown = hasWinner && usesRound(result.method) && result.round != null;
  const showRounds = usesRound(pick?.method) || (hasWinner && usesRound(result.method));
  const disabled = isLocked || !pick || Boolean(result && result.status !== "PENDING");

  function selectMethod(method: Method) {
    if (disabled || !pick) return;
    onChange({ ...pick, method, round: method === "DECISION" || method !== pick.method ? undefined : pick.round });
  }

  return <div className={s.panel} aria-label="Finish prediction">
    <div className={s.row} role="group" aria-label="Finish method">
      {methods.map(method => {
        const picked = pick?.method === method.value;
        const state = optionState(picked, result?.method === method.value, methodKnown, voided);
        return <button type="button" key={method.value} className={s.option} data-state={state} aria-label={`${method.name}: ${stateLabels[state]}`} aria-pressed={picked} disabled={disabled} onClick={() => selectMethod(method.value)}>{method.label}</button>;
      })}
    </div>
    {showRounds && <div className={`${s.row} ${s.rounds}`} role="group" aria-label="Finish round">
      {/* Scheduled round counts are not stored yet. Retain the existing 1–5 range,
          including previously saved picks, rather than infer limits from card order. */}
      {[1, 2, 3, 4, 5].map(round => {
        const picked = usesRound(pick?.method) && pick?.round === round;
        const actual = usesRound(result?.method) && result?.round === round;
        const state = optionState(picked, actual, roundKnown, voided);
        return <button type="button" key={round} className={s.option} data-state={state} aria-label={`Round ${round}: ${stateLabels[state]}`} aria-pressed={picked} disabled={disabled || !usesRound(pick?.method)} onClick={() => { if (!disabled && pick && usesRound(pick.method)) onChange({ ...pick, round }); }}>R{round}</button>;
      })}
    </div>}
  </div>;
}
