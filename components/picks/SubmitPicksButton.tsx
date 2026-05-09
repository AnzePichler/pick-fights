// components/picks/SubmitPicksButton.tsx
type Props = {
  pickedCount: number;
  totalFights: number;
  disabled: boolean;
  isSubmitting: boolean;
  isLocked?: boolean;
  onSubmit: () => void;
};

export default function SubmitPicksButton({
  pickedCount,
  totalFights,
  disabled,
  isSubmitting,
  isLocked = false,
  onSubmit,
}: Props) {
  const pickPercentage =
    totalFights === 0 ? 0 : Math.round((pickedCount / totalFights) * 100);

  const label = isSubmitting
    ? "Submitting..."
    : isLocked
      ? "Picks Locked"
      : disabled
        ? `Make Picks ${pickedCount}/${totalFights}`
        : "Submit Picks";

  return (
    <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 md:bottom-8 md:w-54">
      <button
        type="button"
        disabled={disabled}
        onClick={onSubmit}
        className={`relative w-full overflow-hidden rounded-2xl px-6 py-4 text-center font-bold shadow-lg transition ${
          disabled
            ? "cursor-not-allowed text-white"
            : "cursor-pointer text-white"
        }`}
      >
        <div className="absolute inset-0 bg-neutral-400" />

        <div
          className="absolute inset-y-0 left-0 bg-blue-500 transition-all duration-300"
          style={{ width: `${pickPercentage}%` }}
        />

        <span className="relative z-10">{label}</span>
      </button>
    </div>
  );
}
