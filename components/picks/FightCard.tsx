import FighterSide from "./FighterSide";
import type { Fight } from "../../types/types";

type Props = {
  fight: Fight;
  selectedFighterId: string | undefined;
  onSelectFighter: (fightId: string, fighterId: string) => void;
  isLocked?: boolean;
};

export default function FightCard({
  fight,
  selectedFighterId,
  onSelectFighter,
  isLocked = false,
}: Props) {
  const fighterASelected = selectedFighterId === fight.fighterA.id;
  const fighterBSelected = selectedFighterId === fight.fighterB.id;

  const selectedBorderClass = fighterASelected
    ? "bg-gradient-to-r from-blue-500 via-transparent to-transparent"
    : fighterBSelected
      ? "bg-gradient-to-l from-blue-500 via-transparent to-transparent"
      : "";

  const fighterAWins = getTotalWins(fight.fighterA.record);
  const fighterBWins = getTotalWins(fight.fighterB.record);

  return (
    <div className="relative">
      {selectedFighterId && (
        <>
          <div
            className={`pointer-events-none absolute -inset-2 rounded-[2.3rem] ${selectedBorderClass}`}
          />

          <img
            src="/checkmark.svg"
            alt="Selected"
            className={`pointer-events-none absolute top-8 z-30 h-8 w-8 -translate-y-1/2 ${
              fighterASelected ? "left-3" : "right-3"
            }`}
          />
        </>
      )}

      <details className="relative overflow-hidden rounded-[1.85rem] bg-white shadow-sm transition">
        <summary className="cursor-pointer list-none px-5 py-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <FighterSide
              fighter={fight.fighterA}
              align="left"
              onSelect={() => onSelectFighter(fight.id, fight.fighterA.id)}
              isLocked={isLocked}
            />

            <div className="text-sm font-bold text-gray-400">VS</div>

            <FighterSide
              fighter={fight.fighterB}
              align="right"
              onSelect={() => onSelectFighter(fight.id, fight.fighterB.id)}
              isLocked={isLocked}
            />
          </div>
        </summary>

        <div
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.currentTarget.closest("details")?.removeAttribute("open");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.currentTarget.closest("details")?.removeAttribute("open");
            }
          }}
          className="cursor-pointer px-8 pb-8"
        >
          <div className="rounded-3xl bg-white/70 px-8 py-7">
            <div className="grid grid-cols-[1fr_minmax(260px,340px)_1fr] items-center gap-10">
              <MethodStatsBlock
                side="left"
                totalWins={fighterAWins}
                koWins={fight.fighterA.winsByKo}
                subWins={fight.fighterA.winsBySub}
                decWins={fight.fighterA.winsByDec}
              />

              <div className="space-y-6">
                <ComparisonRow
                  left={fight.fighterA.age}
                  label="Age"
                  right={fight.fighterB.age}
                />

                <ComparisonRow
                  left={formatFeetInches(fight.fighterA.height)}
                  label="Height"
                  right={formatFeetInches(fight.fighterB.height)}
                />

                <ComparisonRow
                  left={formatInches(fight.fighterA.reach)}
                  label="Reach"
                  right={formatInches(fight.fighterB.reach)}
                />
              </div>

              <MethodStatsBlock
                side="right"
                totalWins={fighterBWins}
                koWins={fight.fighterB.winsByKo}
                subWins={fight.fighterB.winsBySub}
                decWins={fight.fighterB.winsByDec}
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function MethodStatsBlock({
  side,
  totalWins,
  koWins,
  subWins,
  decWins,
}: {
  side: "left" | "right";
  totalWins: number | null;
  koWins: number | null | undefined;
  subWins: number | null | undefined;
  decWins: number | null | undefined;
}) {
  return (
    <div className="space-y-6">
      <MethodRow
        side={side}
        label="KO"
        percent={getWinPercent(koWins, totalWins)}
      />

      <MethodRow
        side={side}
        label="SUB"
        percent={getWinPercent(subWins, totalWins)}
      />

      <MethodRow
        side={side}
        label="DEC"
        percent={getWinPercent(decWins, totalWins)}
      />
    </div>
  );
}

function MethodRow({
  side,
  label,
  percent,
}: {
  side: "left" | "right";
  label: string;
  percent: number | null;
}) {
  if (side === "left") {
    return (
      <div className="grid grid-cols-[36px_54px_1fr] items-center gap-3">
        <span className="text-left text-base font-bold text-neutral-500">
          {label}
        </span>

        <span className="text-right text-lg font-semibold text-neutral-700">
          {percent === null ? "—" : `${percent}%`}
        </span>

        <OutsideToCenterBar percent={percent} side="left" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_54px_36px] items-center gap-3">
      <OutsideToCenterBar percent={percent} side="right" />

      <span className="text-left text-lg font-semibold text-neutral-700">
        {percent === null ? "—" : `${percent}%`}
      </span>

      <span className="text-right text-base font-bold text-neutral-500">
        {label}
      </span>
    </div>
  );
}

function OutsideToCenterBar({
  percent,
  side,
}: {
  percent: number | null;
  side: "left" | "right";
}) {
  const width = percent === null ? 0 : Math.max(0, Math.min(100, percent));

  return (
    <div className="h-4 w-full overflow-hidden rounded-sm bg-neutral-100">
      <div
        className={`h-full bg-green-600 ${
          side === "left" ? "mr-auto" : "ml-auto"
        }`}
        style={{
          width: `${width}%`,
        }}
      />
    </div>
  );
}

function ComparisonRow({
  left,
  label,
  right,
}: {
  left: string | number | null | undefined;
  label: string;
  right: string | number | null | undefined;
}) {
  return (
    <div className="grid grid-cols-[1fr_82px_1fr] items-center gap-5">
      <div className="text-right text-xl font-semibold text-neutral-700">
        {displayValue(left)}
      </div>

      <div className="text-center text-md font-bold text-neutral-500">
        {label}
      </div>

      <div className="text-left text-xl font-semibold text-neutral-700">
        {displayValue(right)}
      </div>
    </div>
  );
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
}

function getTotalWins(record: string | null) {
  if (!record) return null;

  const wins = Number(record.split("-")[0]);

  return Number.isFinite(wins) ? wins : null;
}

function getWinPercent(
  methodWins: number | null | undefined,
  totalWins: number | null,
) {
  if (methodWins === null || methodWins === undefined) return null;
  if (!totalWins || totalWins <= 0) return null;

  return Math.round((methodWins / totalWins) * 100);
}

function formatInches(value: string | null) {
  if (!value) return null;

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return value;
  }

  const formatted = Number.isInteger(number)
    ? String(number)
    : number.toFixed(1);

  return `${formatted}"`;
}

function formatFeetInches(value: string | null) {
  if (!value) return null;

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return value;
  }

  const feet = Math.floor(number / 12);
  const inches = number % 12;

  const formattedInches = Number.isInteger(inches)
    ? String(inches)
    : inches.toFixed(1);

  return `${feet}' ${formattedInches}"`;
}
