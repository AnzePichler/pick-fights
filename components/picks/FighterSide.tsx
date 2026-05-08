// components/picks/FighterSide.tsx
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
      className={`w-full rounded-2xl p-3 transition ${
        isLocked ? "cursor-default" : "hover:bg-zinc-50"
      } ${isRight ? "text-right" : "text-left"}`}
    >
      <div
        className={`flex items-center gap-4 ${isRight ? "justify-end" : ""}`}
      >
        {!isRight && <FighterImage fighter={fighter} />}

        <div className="min-w-0">
          {rankLabel && (
            <p
              className={`inline-flex items-center px-1 text-md font-black ${
                rankLabel === "C"
                  ? "mb-0.5 bg-[#ba922d] text-white"
                  : "bg-transparent text-lg text-gray-400"
              }`}
            >
              {rankLabel}
            </p>
          )}

          <h2 className="text-2xl font-bold text-neutral-800">
            {fighter.name}
          </h2>

          <div
            className={`flex flex-wrap items-center gap-2 text-base font-[510] text-neutral-500 ${
              isRight ? "justify-end" : ""
            }`}
          >
            {!isRight && <CountryFlag fighter={fighter} />}

            <span>{fighter.record || "Record unavailable"}</span>

            {isRight && <CountryFlag fighter={fighter} />}
          </div>
        </div>

        {isRight && <FighterImage fighter={fighter} />}
      </div>
    </button>
  );
}

function FighterImage({ fighter }: { fighter: Fighter }) {
  return (
    <div className="h-36 w-36 shrink-0 overflow-hidden rounded-xl">
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
    <span className="inline-flex h-5 w-7 shrink-0 overflow-hidden">
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