import type { Fighter } from "../../types/types";

type Props = {
  fighter: Fighter;
  align: "left" | "right";
  onSelect: () => void;
  isLocked?: boolean;
};

export default function FighterSide({
  fighter,
  align,
  onSelect,
  isLocked = false,
}: Props) {
  const isRight = align === "right";
  const rankLabel = getRankLabel(fighter);

  return (
    <button
      type="button"
      aria-disabled={isLocked}
      onClick={(event) => {
        if (isLocked) {
          return;
        }

        event.preventDefault();
        onSelect();
      }}
      className={`w-full rounded-2xl p-1.5 transition md:p-3 ${
        isLocked ? "cursor-default" : "hover:bg-zinc-50"
      } ${isRight ? "text-center md:text-right" : "text-center md:text-left"}`}
    >
      <div
        className={`flex min-w-0 flex-col items-center gap-2 md:flex-row md:gap-4 ${
          isRight ? "md:justify-end" : ""
        }`}
      >
        {!isRight && <FighterImage fighter={fighter} />}

        {isRight && (
          <div className="md:hidden">
            <FighterImage fighter={fighter} />
          </div>
        )}

        <div className="min-w-0">
          {rankLabel && (
            <p
              className={`inline-flex items-center px-1 text-xs font-black md:text-md ${
                rankLabel === "C"
                  ? "mb-0.5 bg-[#ba922d] text-white"
                  : "bg-transparent text-sm text-[#BDBDBD] md:text-lg"
              }`}
            >
              {rankLabel}
            </p>
          )}

          <h2 className="truncate text-sm font-bold leading-tight text-neutral-800 sm:text-base md:text-2xl">
            {fighter.name}
          </h2>

          <div
            className={`mt-1 flex flex-wrap items-center justify-center gap-1 text-xs font-[510] text-neutral-500 md:gap-2 md:text-base ${
              isRight ? "md:justify-end" : "md:justify-start"
            }`}
          >
            {!isRight && <CountryFlag fighter={fighter} />}

            {isRight && (
              <span className="md:hidden">
                <CountryFlag fighter={fighter} />
              </span>
            )}

            <span>{fighter.record || "Record unavailable"}</span>

            {isRight && (
              <span className="hidden md:inline-flex">
                <CountryFlag fighter={fighter} />
              </span>
            )}
          </div>
        </div>

        {isRight && (
          <div className="hidden md:block">
            <FighterImage fighter={fighter} />
          </div>
        )}
      </div>
    </button>
  );
}

function FighterImage({ fighter }: { fighter: Fighter }) {
  return (
    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-24 md:h-36 md:w-36">
      <img
        src={fighter.imageUrl || "/fighter-placeholder.png"}
        alt={fighter.name}
        className="h-full w-full object-cover object-top"
      />
    </div>
  );
}

function CountryFlag({ fighter }: { fighter: Fighter }) {
  if (!fighter.countryFlagUrl) return null;

  return (
    <span className="inline-flex h-4 w-6 shrink-0 overflow-hidden md:h-5 md:w-7">
      <img
        src={fighter.countryFlagUrl}
        alt={fighter.country || "Country flag"}
        title={fighter.country || undefined}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

function getRankLabel(fighter: Fighter) {
  if (isChampion(fighter)) return "C";
  if (fighter.ranking != null) return `#${fighter.ranking}`;
  return null;
}

function isChampion(fighter: Fighter) {
  const imageUrl = (fighter.imageUrl || "").toUpperCase();
  return imageUrl.includes("BELT");
}
