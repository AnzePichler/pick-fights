// lib/scoring.ts
export type PickMethod = "KO_TKO" | "SUBMISSION" | "DECISION";
export type FightMethod = "KO_TKO" | "SUBMISSION" | "DECISION";

export type FightResultStatus =
  | "PENDING"
  | "WINNER"
  | "DRAW"
  | "NO_CONTEST"
  | "CANCELLED";

export const BASE_WINNER_POINTS = 50;

export function getRarityMultiplier({
  winnerPickCount,
  totalPickCount,
}: {
  winnerPickCount: number;
  totalPickCount: number;
}) {
  if (totalPickCount <= 0 || winnerPickCount <= 0) {
    return 1;
  }

  const percentage = (winnerPickCount / totalPickCount) * 100;

  if (percentage >= 50) return 1;
  if (percentage >= 30) return 1.15;
  if (percentage >= 15) return 1.3;

  return 1.5;
}

export function getMethodBonus({
  pickedMethod,
  pickedRound,
  resultMethod,
  resultRound,
}: {
  pickedMethod?: PickMethod | null;
  pickedRound?: number | null;
  resultMethod?: FightMethod | null;
  resultRound?: number | null;
}) {
  if (!pickedMethod || !resultMethod) {
    return 0;
  }

  if (pickedMethod !== resultMethod) {
    return 0;
  }

  if (resultMethod === "DECISION") {
    return 15;
  }

  if (resultMethod === "KO_TKO" || resultMethod === "SUBMISSION") {
    if (
      pickedRound != null &&
      resultRound != null &&
      pickedRound === resultRound
    ) {
      return 50;
    }

    return 25;
  }

  return 0;
}

export function calculatePickPoints({
  pickedFighterId,
  pickedMethod,
  pickedRound,
  result,
  rarityMultiplier,
}: {
  pickedFighterId: string;
  pickedMethod?: PickMethod | null;
  pickedRound?: number | null;
  result?: {
    status: FightResultStatus;
    winnerFighterId: string | null;
    method: FightMethod | null;
    round: number | null;
  } | null;
  rarityMultiplier: number;
}) {
  if (!result || result.status !== "WINNER") {
    return 0;
  }

  if (!result.winnerFighterId) {
    return 0;
  }

  if (pickedFighterId !== result.winnerFighterId) {
    return 0;
  }

  const methodBonus = getMethodBonus({
    pickedMethod,
    pickedRound,
    resultMethod: result.method,
    resultRound: result.round,
  });

  return Math.round((BASE_WINNER_POINTS + methodBonus) * rarityMultiplier);
}

export function isCorrectWinnerPick({
  pickedFighterId,
  result,
}: {
  pickedFighterId: string;
  result?: {
    status: FightResultStatus;
    winnerFighterId: string | null;
  } | null;
}) {
  return (
    result?.status === "WINNER" && result.winnerFighterId === pickedFighterId
  );
}
