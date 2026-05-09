"use client";

import { useState, useTransition } from "react";
import { Wheat } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { updateGrainStorage } from "@/app/(dashboard)/my-farm/actions";
import type { GrainStorageComparison } from "@/lib/queries/grain-storage-comparison";

interface GrainStorageCardProps {
  grain: string;
  /** Current saved total (tonnes). 0 if not yet set. */
  initialTotalTonnes: number;
  /** Current saved remaining (tonnes). 0 if not yet set. */
  initialRemainingTonnes: number;
  /**
   * Peer comparison data. null when the privacy threshold (>= 5 farmers
   * tracking this grain) hasn't been met yet, or when the calling farmer
   * hasn't saved values yet.
   */
  comparison: GrainStorageComparison | null;
}

function formatTonnes(value: number): string {
  if (value === 0) return "0";
  if (value < 10) return value.toFixed(1);
  return Math.round(value).toLocaleString();
}

/**
 * The simple two-input storage tracker for /my-farm. Farmer enters their
 * total grain for the year and how much is left in the bin; both can be
 * adjusted at any time. Below the inputs we surface a single peer-comparison
 * stat: "X% of farmers have more <grain> in the bin than you."
 *
 * The card is intentionally minimal — no contracts, no deliveries, no
 * acreage. Those still live elsewhere on /my-farm; this is the headline
 * metric.
 */
export function GrainStorageCard({
  grain,
  initialTotalTonnes,
  initialRemainingTonnes,
  comparison,
}: GrainStorageCardProps) {
  const [totalInput, setTotalInput] = useState(
    initialTotalTonnes > 0 ? String(initialTotalTonnes) : ""
  );
  const [remainingInput, setRemainingInput] = useState(
    initialRemainingTonnes > 0 ? String(initialRemainingTonnes) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalNum = Number(totalInput);
  const remainingNum = Number(remainingInput);
  const hasChanged =
    totalNum !== initialTotalTonnes || remainingNum !== initialRemainingTonnes;
  const isValid =
    totalInput !== "" &&
    remainingInput !== "" &&
    !Number.isNaN(totalNum) &&
    !Number.isNaN(remainingNum) &&
    totalNum >= 0 &&
    remainingNum >= 0 &&
    remainingNum <= totalNum;

  function handleSave() {
    setError(null);
    if (!isValid) {
      setError("Remaining cannot exceed total.");
      return;
    }

    const formData = new FormData();
    formData.set("grain", grain);
    formData.set("total_tonnes", String(totalNum));
    formData.set("remaining_tonnes", String(remainingNum));

    startTransition(async () => {
      const result = await updateGrainStorage(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
    });
  }

  const showSaved = savedAt !== null && Date.now() - savedAt < 3000;

  return (
    <GlassCard elevation={2} hover={false} className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-canola/10">
          <Wheat className="h-4 w-4 text-canola" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-display font-semibold text-foreground">
            {grain}
          </h3>
          <p className="text-xs text-muted-foreground">
            In your bin (tonnes)
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`total-${grain}`} className="text-xs">
            Total
          </Label>
          <Input
            id={`total-${grain}`}
            type="number"
            inputMode="numeric"
            min="0"
            step="any"
            placeholder="0"
            value={totalInput}
            onChange={(e) => {
              setTotalInput(e.target.value);
              setError(null);
              setSavedAt(null);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`remaining-${grain}`} className="text-xs">
            Left in bin
          </Label>
          <Input
            id={`remaining-${grain}`}
            type="number"
            inputMode="numeric"
            min="0"
            step="any"
            placeholder="0"
            value={remainingInput}
            onChange={(e) => {
              setRemainingInput(e.target.value);
              setError(null);
              setSavedAt(null);
            }}
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <ComparisonLine grain={grain} comparison={comparison} />
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!hasChanged || !isValid || isPending}
        >
          {isPending ? "Saving…" : showSaved ? "Saved" : "Save"}
        </Button>
      </div>
    </GlassCard>
  );
}

function ComparisonLine({
  grain,
  comparison,
}: {
  grain: string;
  comparison: GrainStorageComparison | null;
}) {
  if (!comparison) {
    return (
      <p className="text-xs text-muted-foreground">
        Peer comparison unlocks once 5+ farmers track {grain}.
      </p>
    );
  }

  const pct = Math.round(comparison.pct_farmers_with_more_remaining);

  // Exactly the framing the product asked for.
  return (
    <p className={cn("text-sm text-foreground")}>
      <span className="font-semibold text-canola">{pct}%</span>
      <span className="text-muted-foreground">
        {" "}of farmers have more {grain} in the bin than you.
      </span>
    </p>
  );
}
