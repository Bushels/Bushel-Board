import { Leaf, ShieldCheck } from "lucide-react";

interface BushyWelcomeProps {
  onChipSelect: (chip: string) => void;
}

const STARTER_CHIPS = [
  "Should I be hauling my wheat?",
  "How does my area look?",
  "What's basis doing for canola?",
];

export function BushyWelcome({ onChipSelect }: BushyWelcomeProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      {/* Bushy icon */}
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-canola/12">
        <Leaf className="h-7 w-7 text-canola" />
      </div>

      {/* Intro */}
      <h1 className="mt-4 font-display text-xl font-bold text-foreground">
        Hey, I&apos;m Bushy.
      </h1>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        I&apos;m your farming buddy — trained on CGC pipeline data, futures,
        CFTC positioning, and what farmers in your area are seeing.
      </p>

      {/* Privacy transparency */}
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-prairie/8 px-3 py-2 text-left">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-prairie" />
        <p className="text-xs text-muted-foreground">
          Your data stays yours. Anything you share is anonymized before it
          helps your area. Nobody sees your name or farm.
        </p>
      </div>

      {/* Starter chips */}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {STARTER_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onChipSelect(chip)}
            className="rounded-full border border-canola/25 bg-canola/8 px-4 py-2 text-sm font-medium text-canola transition-colors hover:bg-canola/15 active:scale-[0.97]"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
