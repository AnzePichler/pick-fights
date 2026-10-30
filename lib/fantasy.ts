export const FANTASY_SLOTS = [
  { id: "CAPTAIN", label: "Captain", condition: "Win by any method", points: 100 },
  { id: "FINISH_ONE", label: "Finish", condition: "Win by KO/TKO or submission", points: 50 },
  { id: "FINISH_TWO", label: "Finish", condition: "Win by KO/TKO or submission", points: 50 },
  { id: "DECISION", label: "Decision", condition: "Win by decision", points: 50 },
  { id: "UNDERDOG", label: "Underdog", condition: "Underdog wins by any method", points: 50 },
] as const;

export type FantasySlotId = (typeof FANTASY_SLOTS)[number]["id"];
export type FantasyChoice = { slot: FantasySlotId; fightId: string; fighterId: string };
export type FantasyFighter = {
  id: string;
  fightId: string;
  name: string;
  opponent: string;
  imageUrl?: string | null;
  odds: number | null;
  isUnderdog: boolean;
};
export type FantasyFight = {
  id: string;
  status: string;
  fighterAId: string;
  fighterBId: string;
  fighterAIsUnderdog: boolean;
  fighterBIsUnderdog: boolean;
  result?: { status: string; winnerFighterId: string | null; method: string | null } | null;
};

export function fantasyIsOpen(event: { status: string; lockAt: Date }, now = Date.now()) {
  return event.status === "OPEN" && event.lockAt.getTime() > now;
}

export function eligibleFantasyFighters(
  slot: FantasySlotId,
  fighters: FantasyFighter[],
  choices: FantasyChoice[],
) {
  const otherChoices = choices.filter((choice) => choice.slot !== slot);
  const usedIds = new Set(otherChoices.map((choice) => choice.fighterId));
  const usedFightIds = new Set(otherChoices.map((choice) => choice.fightId));
  return fighters.filter((fighter) =>
    !usedIds.has(fighter.id) && !usedFightIds.has(fighter.fightId) &&
    (slot !== "UNDERDOG" || fighter.isUnderdog),
  );
}

export function validateFantasyChoices(choices: FantasyChoice[], fights: FantasyFight[]) {
  if (choices.length !== FANTASY_SLOTS.length ||
      new Set(choices.map((choice) => choice.slot)).size !== FANTASY_SLOTS.length) {
    return "Choose a fighter for each of the five slots.";
  }
  if (new Set(choices.map((choice) => choice.fighterId)).size !== choices.length) {
    return "Choose five unique fighters.";
  }
  if (new Set(choices.map((choice) => choice.fightId)).size !== choices.length) {
    return "Choose fighters from five different fights. Only one fighter per fight is allowed.";
  }
  for (const choice of choices) {
    if (!FANTASY_SLOTS.some((slot) => slot.id === choice.slot)) return "Invalid fantasy slot.";
    const fight = fights.find((item) => item.id === choice.fightId && item.status === "ACTIVE");
    if (!fight || ![fight.fighterAId, fight.fighterBId].includes(choice.fighterId)) {
      return "A selected fighter is no longer on the active card. Update your lineup.";
    }
    const isUnderdog = choice.fighterId === fight.fighterAId
      ? fight.fighterAIsUnderdog : fight.fighterBIsUnderdog;
    if (choice.slot === "UNDERDOG" && !isUnderdog) {
      return "The Underdog slot requires a fighter with imported odds greater than +100.";
    }
  }
  return null;
}

export function scoreFantasyChoice(choice: FantasyChoice, fight?: FantasyFight): number | null {
  if (!fight || fight.status !== "ACTIVE") return 0;
  const result = fight.result;
  if (!result || result.status === "PENDING") return null;
  if (result.status !== "WINNER" || result.winnerFighterId !== choice.fighterId) return 0;
  switch (choice.slot) {
    case "CAPTAIN": return 100;
    case "FINISH_ONE":
    case "FINISH_TWO":
      if (!result.method) return null;
      return result.method === "KO_TKO" || result.method === "SUBMISSION" ? 50 : 0;
    case "DECISION":
      if (!result.method) return null;
      return result.method === "DECISION" ? 50 : 0;
    case "UNDERDOG":
      return (choice.fighterId === fight.fighterAId ? fight.fighterAIsUnderdog : fight.fighterBIsUnderdog) ? 50 : 0;
  }
}
