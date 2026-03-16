"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronDown, Lock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { UnlockModal } from "@/components/dashboard/unlock-modal";
import type { GrainDef } from "@/lib/constants/grains";
import { cn } from "@/lib/utils";

interface GrainDropdownProps {
  allGrains: GrainDef[];
  unlockedGrains: string[];
}

export function GrainDropdown({
  allGrains,
  unlockedGrains,
}: GrainDropdownProps) {
  const [open, setOpen] = useState(false);
  const [unlockGrain, setUnlockGrain] = useState<GrainDef | null>(null);
  const pathname = usePathname();

  const yourCrops = allGrains.filter((grain) => unlockedGrains.includes(grain.name));
  const lockedGrains = allGrains.filter((grain) => !unlockedGrains.includes(grain.name));
  const isActive = pathname.startsWith("/grain/");

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-10 gap-1 rounded-full px-4 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-white/80 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_12px_30px_-20px_rgba(42,38,30,0.45)] dark:bg-white/10 dark:text-wheat-50"
                : "text-muted-foreground hover:bg-white/60 hover:text-foreground dark:hover:bg-white/8 dark:hover:text-wheat-50"
            )}
          >
            Grains
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72 overflow-hidden rounded-3xl border border-white/50 bg-background/90 p-0 shadow-[0_24px_50px_-24px_rgba(42,38,30,0.55)] backdrop-blur-2xl dark:border-white/10 dark:bg-wheat-900/88"
        >
          <div className="border-b border-border/50 bg-white/40 p-4 dark:bg-white/5">
            <p className="px-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Your Crops
            </p>
            <p className="px-2 pt-1 text-xs text-muted-foreground">
              Jump into the grains already tailored to your farm.
            </p>
          </div>
          <div className="px-3 py-3">
            {yourCrops.length === 0 ? (
              <Link
                href="/my-farm"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-2xl border border-dashed border-canola/25 bg-canola/5 px-3 py-3 text-sm text-muted-foreground transition-colors hover:border-canola/40 hover:bg-canola/10"
              >
                No crops tracked yet. Set up My Farm to unlock tailored grain pages.
              </Link>
            ) : (
              yourCrops.map((grain) => (
                <Link
                  key={grain.slug}
                  href={`/grain/${grain.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-colors hover:bg-white/65 dark:hover:bg-white/7"
                >
                  <Check className="h-3.5 w-3.5 text-prairie" aria-hidden="true" />
                  {grain.name}
                </Link>
              ))
            )}
          </div>

          <div className="h-px bg-border/70" />

          <div className="border-b border-border/40 px-4 py-3">
            <p className="px-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              All Grains
            </p>
            <p className="px-2 pt-1 text-xs text-muted-foreground">
              Add a crop to unlock the grain page, then sharpen it with deliveries and X feedback.
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto px-3 py-3">
            {lockedGrains.map((grain) => (
              <button
                key={grain.slug}
                onClick={() => {
                  setOpen(false);
                  setUnlockGrain(grain);
                }}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-white/65 hover:text-foreground dark:hover:bg-white/7"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                {grain.name}
              </button>
            ))}
            {lockedGrains.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                All grains unlocked!
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {unlockGrain && (
        <UnlockModal
          grain={unlockGrain.name}
          onClose={() => setUnlockGrain(null)}
        />
      )}
    </>
  );
}
