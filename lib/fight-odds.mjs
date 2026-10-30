export function parseAmericanOdds(value) {
  if (value === undefined || value === null || value === "") return null;

  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !/^[+-]?\d+$/.test(value.trim()))
  ) {
    throw new Error(`Invalid American odds: ${String(value)}`);
  }

  const odds = Number(value);

  if (!Number.isInteger(odds) || Math.abs(odds) < 100 || Math.abs(odds) > 2147483647) {
    throw new Error(`Invalid American odds: ${String(value)}`);
  }

  return odds;
}

export function fightOddsData(fighterAOdds, fighterBOdds) {
  const parsedA = parseAmericanOdds(fighterAOdds);
  const parsedB = parseAmericanOdds(fighterBOdds);

  return {
    fighterAOdds: parsedA,
    fighterBOdds: parsedB,
    fighterAIsUnderdog: parsedA !== null && parsedA > 100,
    fighterBIsUnderdog: parsedB !== null && parsedB > 100,
  };
}
