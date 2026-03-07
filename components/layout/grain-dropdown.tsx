"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Lock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { UnlockModal } from "@/components/dashboard/unlock-modal";
import type { GrainDef } from "@/lib/constants/grains";

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

  const yourCrops = allGrains.filter((g) => unlockedGrains.includes(g.name));
  const lockedGrains = allGrains.filter(
    (g) => !unlockedGrains.includes(g.name)
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-sm font-normal"
          >
            Grains
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          {/* Your Crops section */}
          <div className="p-3 pb-2">
            <p className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Your Crops
            </p>
          </div>
          <div className="px-3 pb-2">
            {yourCrops.length === 0 ? (
              <Link
                href="/my-farm"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                No crops tracked yet — set up My Farm
              </Link>
            ) : (
              yourCrops.map((g) => (
                <Link
                  key={g.slug}
                  href={`/grain/${g.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                >
                  <Check className="h-3.5 w-3.5 text-prairie" />
                  {g.name}
                </Link>
              ))
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* All Grains section */}
          <div className="p-3 pb-2">
            <p className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              All Grains
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto px-3 pb-3">
            {lockedGrains.map((g) => (
              <button
                key={g.slug}
                onClick={() => {
                  setOpen(false);
                  setUnlockGrain(g);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Lock className="h-3.5 w-3.5" />
                {g.name}
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

      {/* Unlock Modal */}
      {unlockGrain && (
        <UnlockModal
          grain={unlockGrain.name}
          slug={unlockGrain.slug}
          onClose={() => setUnlockGrain(null)}
        />
      )}
    </>
  );
}
