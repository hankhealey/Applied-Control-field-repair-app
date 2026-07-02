const STEPS = ["Job", "As Found", "As Left", "Review"];

export default function StepIndicator({
  current,
  completed,
  onSelect,
}: {
  current: number;
  completed: boolean[];
  onSelect: (i: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {STEPS.map((label, i) => {
        const isCurrent = i === current;
        const isDone = completed[i];
        return (
          <button
            type="button"
            key={label}
            onClick={() => onSelect(i)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
              isCurrent
                ? "bg-[#154A8A] text-white"
                : isDone
                  ? "bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
                  : "bg-[var(--bg-surface)] text-[var(--text-secondary)]"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                isCurrent
                  ? "bg-white/20"
                  : isDone
                    ? "bg-emerald-500 text-white"
                    : "bg-[var(--border-solid)] text-[var(--text-secondary)]"
              }`}
            >
              {isDone && !isCurrent ? "✓" : i + 1}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
