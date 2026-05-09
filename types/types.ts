export type Fighter = {
  id: string;
  name: string;
  nickname: string | null;
  imageUrl: string | null;
  countryFlagUrl: string | null;
  ranking: number | null;
  country: string | null;
  record: string | null;
  lastFight: string | null;
  age: number | null;
  height: string | null;
  reach: string | null;
  winsByKo: number | null;
  winsBySub: number | null;
  winsByDec: number | null;
};

export type Fight = {
  id: string;
  eventId: string;
  fighterAId: string;
  fighterBId: string;
  order: number;
  fighterA: Fighter;
  fighterB: Fighter;
  result?: {
    status: "PENDING" | "WINNER" | "DRAW" | "NO_CONTEST" | "CANCELLED";
    winnerFighterId: string | null;
  } | null;
};

export type PickDraft = {
  fighterId: string;
};
