"use client";

interface QuickChipsProps {
  chips: string[];
  onSelect: (chip: string) => void;
  disabled?: boolean;
}

export function QuickChips({ chips, onSelect, disabled }: QuickChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto overscroll-x-contain px-3 pb-2 pt-2 scrollbar-none">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(chip)}
          className="shrink-0 rounded-full border border-canola/25 bg-canola/8 px-3.5 py-2 text-xs font-medium text-canola transition-colors hover:bg-canola/15 active:scale-[0.97] disabled:opacity-50 dark:border-canola/20"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
