"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Lock, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UnlockModal } from "@/components/dashboard/unlock-modal";
import type { GrainDef } from "@/lib/constants/grains";

interface MobileNavProps {
  allGrains: GrainDef[];
  unlockedGrains: string[];
}

export function MobileNav({ allGrains, unlockedGrains }: MobileNavProps) {
  const [unlockGrain, setUnlockGrain] = useState<GrainDef | null>(null);

  const yourCrops = allGrains.filter((g) => unlockedGrains.includes(g.name));
  const lockedGrains = allGrains.filter(
    (g) => !unlockedGrains.includes(g.name)
  );

  return (
    <>
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle className="font-display text-canola">
                Bushel Board
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4 pt-4">
              <Link
                href="/overview"
                className="px-3 py-2 rounded-md hover:bg-accent transition-colors"
              >
                Overview
              </Link>
              <Link
                href="/my-farm"
                className="px-3 py-2 rounded-md hover:bg-accent transition-colors"
              >
                My Farm
              </Link>

              {/* Your Crops */}
              <div className="h-px bg-border my-2" />
              <p className="px-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Your Crops
              </p>
              {yourCrops.length === 0 ? (
                <Link
                  href="/my-farm"
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent transition-colors"
                >
                  No crops tracked yet — set up My Farm
                </Link>
              ) : (
                yourCrops.map((g) => (
                  <Link
                    key={g.slug}
                    href={`/grain/${g.slug}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent transition-colors text-sm"
                  >
                    <Check className="h-3.5 w-3.5 text-prairie" />
                    {g.name}
                  </Link>
                ))
              )}

              {/* All Grains (locked) */}
              <div className="h-px bg-border my-2" />
              <p className="px-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                All Grains
              </p>
              {lockedGrains.map((g) => (
                <button
                  key={g.slug}
                  onClick={() => setUnlockGrain(g)}
                  className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-left"
                >
                  <Lock className="h-3.5 w-3.5" />
                  {g.name}
                </button>
              ))}
              {lockedGrains.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  All grains unlocked!
                </p>
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>

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
