"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, Lock, LogOut, Menu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UnlockModal } from "@/components/dashboard/unlock-modal";
import { createClient } from "@/lib/supabase/client";
import type { GrainDef } from "@/lib/constants/grains";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  allGrains: GrainDef[];
  unlockedGrains: string[];
  userEmail?: string | null;
}

export function MobileNav({ allGrains, unlockedGrains, userEmail }: MobileNavProps) {
  const [unlockGrain, setUnlockGrain] = useState<GrainDef | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const yourCrops = allGrains.filter((grain) => unlockedGrains.includes(grain.name));
  const lockedGrains = allGrains.filter((grain) => !unlockedGrains.includes(grain.name));

  return (
    <>
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open menu"
              className="rounded-full border border-white/40 bg-white/35 shadow-[0_14px_32px_-22px_rgba(42,38,30,0.55)] backdrop-blur-xl hover:bg-white/55 dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/10"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-80 border-l border-white/45 bg-background/92 px-0 backdrop-blur-2xl dark:border-white/10 dark:bg-wheat-900/92"
          >
            <SheetHeader className="border-b border-border/50 px-5 pb-4">
              <SheetTitle className="font-display text-canola">Bushel Board</SheetTitle>
              <p className="text-xs text-muted-foreground">
                Your market shell, crop unlocks, and farm setup in one place.
              </p>
            </SheetHeader>

            <nav className="flex flex-col gap-1 px-4 pt-4">
              <Link
                href="/overview"
                className={cn(
                  "rounded-2xl px-3 py-2.5 transition-colors",
                  pathname.startsWith("/overview")
                    ? "bg-white/70 text-foreground shadow-sm dark:bg-white/10"
                    : "hover:bg-white/55 dark:hover:bg-white/7"
                )}
              >
                Overview
              </Link>
              <Link
                href="/my-farm"
                className={cn(
                  "rounded-2xl px-3 py-2.5 transition-colors",
                  pathname.startsWith("/my-farm")
                    ? "bg-white/70 text-foreground shadow-sm dark:bg-white/10"
                    : "hover:bg-white/55 dark:hover:bg-white/7"
                )}
              >
                My Farm
              </Link>
              <Link
                href="/advisor"
                className={cn(
                  "rounded-2xl px-3 py-2.5 transition-colors",
                  pathname.startsWith("/advisor")
                    ? "bg-white/70 text-foreground shadow-sm dark:bg-white/10"
                    : "hover:bg-white/55 dark:hover:bg-white/7"
                )}
              >
                Advisor
              </Link>

              {yourCrops.length === 0 && (
                <div className="mt-2 rounded-3xl border border-canola/20 bg-canola/8 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Sparkles className="h-4 w-4 text-canola" />
                    Unlock tailored AI with one crop
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Start in My Farm. Acres unlock the dashboard now; deliveries and signal feedback make it sharper over time.
                  </p>
                </div>
              )}

              <div className="my-2 h-px bg-border" />
              <p className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your Crops
              </p>
              {yourCrops.length === 0 ? (
                <Link
                  href="/my-farm"
                  className="flex items-center gap-2 rounded-2xl border border-dashed border-canola/25 bg-canola/5 px-3 py-3 text-sm text-muted-foreground transition-colors hover:border-canola/40 hover:bg-canola/10"
                >
                  No crops tracked yet. Set up My Farm.
                </Link>
              ) : (
                yourCrops.map((grain) => (
                  <Link
                    key={grain.slug}
                    href={`/grain/${grain.slug}`}
                    className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm transition-colors hover:bg-white/55 dark:hover:bg-white/7"
                  >
                    <Check className="h-3.5 w-3.5 text-prairie" aria-hidden="true" />
                    {grain.name}
                  </Link>
                ))
              )}

              <div className="my-2 h-px bg-border" />
              <p className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                All Grains
              </p>
              {lockedGrains.map((grain) => (
                <button
                  key={grain.slug}
                  onClick={() => setUnlockGrain(grain)}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-white/55 hover:text-foreground dark:hover:bg-white/7"
                >
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  {grain.name}
                </button>
              ))}
              {lockedGrains.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  All grains unlocked!
                </p>
              )}

              {userEmail && (
                <>
                  <div className="my-2 h-px bg-border" />
                  <p className="px-3 text-xs text-muted-foreground truncate">
                    {userEmail}
                  </p>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-white/55 hover:text-foreground dark:hover:bg-white/7"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    Sign out
                  </button>
                </>
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>

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
