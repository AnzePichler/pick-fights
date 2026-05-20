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

  const resultStatus = fight.result?.status;
  const winnerFighterId = fight.result?.winnerFighterId;

  const fightHasResult = resultStatus && resultStatus !== "PENDING";

  const fightIsDrawLike =
    resultStatus === "DRAW" ||
    resultStatus === "NO_CONTEST" ||
    resultStatus === "CANCELLED";

  const selectedPickIsCorrect =
    fightHasResult &&
    resultStatus === "WINNER" &&
    selectedFighterId === winnerFighterId;

  const selectedPickIsWrong =
    fightHasResult &&
    resultStatus === "WINNER" &&
    Boolean(selectedFighterId) &&
    selectedFighterId !== winnerFighterId;

  const selectedPickIsDrawLike =
    fightHasResult && fightIsDrawLike && Boolean(selectedFighterId);

  const selectedSideGradient = fighterASelected
    ? "bg-gradient-to-r"
    : fighterBSelected
      ? "bg-gradient-to-l"
      : "";

  const selectedHighlightClass = selectedPickIsCorrect
    ? `${selectedSideGradient} from-green-500 via-transparent to-transparent`
    : selectedPickIsWrong
      ? `${selectedSideGradient} from-red-500 via-transparent to-transparent`
      : selectedPickIsDrawLike
        ? `${selectedSideGradient} from-neutral-500 via-transparent to-transparent`
        : selectedFighterId
          ? `${selectedSideGradient} from-blue-500 via-transparent to-transparent`
          : "";

  const selectedIconSrc = selectedPickIsCorrect
    ? "/correct.svg"
    : selectedPickIsWrong
      ? "/wrong.svg"
      : selectedPickIsDrawLike
        ? "/draw.svg"
        : selectedFighterId
          ? "/checkmark.svg"
          : null;

  const selectedIconAlt = selectedPickIsCorrect
    ? "Correct pick"
    : selectedPickIsWrong
      ? "Wrong pick"
      : selectedPickIsDrawLike
        ? "Draw, no contest, or cancelled"
        : "Selected";

  const fighterAWins = getTotalWins(fight.fighterA.record);
  const fighterBWins = getTotalWins(fight.fighterB.record);

  return (
    <div className="relative">
      {selectedFighterId && (
        <>
          <div
            className={`pointer-events-none absolute -inset-1.5 rounded-[1.8rem] md:-inset-1.5 md:rounded-[2.2rem] ${selectedHighlightClass}`}
          />

          {selectedIconSrc && (
            <img
              src={selectedIconSrc}
              alt={selectedIconAlt}
              className={`pointer-events-none absolute top-5 z-30 h-5 w-5 -translate-y-1/2 md:top-6 md:h-6 md:w-6 ${
                fighterASelected ? "left-2 md:left-3" : "right-2 md:right-3"
              }`}
            />
          )}
        </>
      )}

      <details className="relative overflow-hidden rounded-[1.5rem] bg-white shadow-sm transition md:rounded-[1.85rem]">
        <summary className="relative cursor-pointer list-none px-3 py-4 md:px-5 md:py-5">
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 w-[150px] -translate-x-1/2 text-center md:top-4 md:w-[220px]">
            {fight.weightClass && (
              <div className="mb-1 truncate text-[9px] font-black tracking-[0.22em] text-neutral-400 md:mb-2 md:text-xs">
                {formatWeightClass(fight.weightClass)}
              </div>
            )}

            <div className="mt-16 text-xs font-black text-gray-400 md:text-sm">
              VS
            </div>
          </div>

          <div className="grid grid-cols-2 items-center gap-8 md:gap-20">
            <div className="min-w-0">
              <FighterSide
                fighter={fight.fighterA}
                align="left"
                onSelect={() => onSelectFighter(fight.id, fight.fighterA.id)}
                isLocked={isLocked}
              />
            </div>

            <div className="min-w-0">
              <FighterSide
                fighter={fight.fighterB}
                align="right"
                onSelect={() => onSelectFighter(fight.id, fight.fighterB.id)}
                isLocked={isLocked}
              />
            </div>
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
          className="cursor-pointer px-3 pb-4 md:px-8 md:pb-8"
        >
          <div className="rounded-2xl bg-white/70 px-3 py-4 md:rounded-3xl md:px-8 md:py-7">
            <div className="grid grid-cols-[minmax(70px,1fr)_minmax(110px,1.2fr)_minmax(70px,1fr)] items-center gap-2 md:grid-cols-[1fr_minmax(260px,340px)_1fr] md:gap-10">
              <MethodStatsBlock
                side="left"
                totalWins={fighterAWins}
                koWins={fight.fighterA.winsByKo}
                subWins={fight.fighterA.winsBySub}
                decWins={fight.fighterA.winsByDec}
              />

              <div className="space-y-3 md:space-y-6">
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
    <div className="space-y-3 md:space-y-6">
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
      <div className="grid grid-cols-[22px_32px_minmax(28px,1fr)] items-center gap-1.5 md:grid-cols-[36px_54px_1fr] md:gap-3">
        <span className="text-left text-[10px] font-bold text-neutral-500 md:text-base">
          {label}
        </span>

        <span className="text-right text-xs font-semibold text-neutral-700 md:text-lg">
          {percent === null ? "—" : `${percent}%`}
        </span>

        <OutsideToCenterBar percent={percent} side="left" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(28px,1fr)_32px_22px] items-center gap-1.5 md:grid-cols-[1fr_54px_36px] md:gap-3">
      <OutsideToCenterBar percent={percent} side="right" />

      <span className="text-left text-xs font-semibold text-neutral-700 md:text-lg">
        {percent === null ? "—" : `${percent}%`}
      </span>

      <span className="text-right text-[10px] font-bold text-neutral-500 md:text-base">
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
    <div className="h-2.5 w-full overflow-hidden rounded-sm bg-neutral-100 md:h-4">
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
    <div className="grid grid-cols-[1fr_46px_1fr] items-center gap-2 md:grid-cols-[1fr_82px_1fr] md:gap-5">
      <div className="text-right text-xs font-semibold text-neutral-700 md:text-xl">
        {displayValue(left)}
      </div>

      <div className="text-center text-[10px] font-bold text-neutral-500 md:text-sm">
        {label}
      </div>

      <div className="text-left text-xs font-semibold text-neutral-700 md:text-xl">
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

function formatWeightClass(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/women'?s/g, "")
    .replace(/men'?s/g, "")
    .replace(/bout/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.includes("strawweight")) {
    return "strawweight";
  }

  if (normalized.includes("flyweight")) {
    return "flyweight";
  }

  if (normalized.includes("bantamweight")) {
    return "bantamweight";
  }

  if (normalized.includes("featherweight")) {
    return "featherweight";
  }

  if (
    normalized.includes("light heavyweight") ||
    normalized.includes("lightheavyweight")
  ) {
    return "lightheavyweight";
  }

  if (normalized.includes("lightweight")) {
    return "lightweight";
  }

  if (normalized.includes("welterweight")) {
    return "welterweight";
  }

  if (normalized.includes("middleweight")) {
    return "middleweight";
  }

  if (normalized.includes("heavyweight")) {
    return "heavyweight";
  }

  return value
    .replace(/women'?s/gi, "")
    .replace(/men'?s/gi, "")
    .replace(/bout/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
