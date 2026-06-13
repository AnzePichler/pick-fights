// components/picks/types.ts
import type { FightMethod, FightResultStatus } from "@prisma/client";

export type PicksFighter = {
  id: string;
  name: string;
  record: string | null;
  imageUrl: string | null;
  country: string | null;
  countryFlagUrl: string | null;
  ranking: number | null;
  age: number | null;
  height: string | null;
  reach: string | null;
  winsByKo: number | null;
  winsBySub: number | null;
  winsByDec: number | null;
};

export type PicksFight = {
  id: string;
  order: number;
  weightClass: string | null;
  fighterA: PicksFighter;
  fighterB: PicksFighter;
  result: {
    status: FightResultStatus;
    winnerFighterId: string | null;
    method: FightMethod | null;
    round: number | null;
  } | null;
};
