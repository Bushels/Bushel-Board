import Link from "next/link";
import { Suspense } from "react";
import { ThemeToggle } from "./theme-toggle";
import { MobileNav } from "./mobile-nav";
import { CgcFreshness } from "./cgc-freshness";
import { Logo } from "./logo";
import { GrainDropdown } from "./grain-dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { getUserUnlockedGrains } from "@/lib/queries/crop-plans";
import { ALL_GRAINS } from "@/lib/constants/grains";

export async function Nav() {
  // Fetch the current user's unlocked grains
  let unlockedGrains: string[] = [];
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      unlockedGrains = await getUserUnlockedGrains(user.id);
    }
  } catch {
    // If auth fails (e.g. no cookies context), show all grains as locked
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={28} />
            <span className="text-lg font-semibold font-display text-canola">
              Bushel Board
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/overview"
              className="px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
            >
              Overview
            </Link>
            <GrainDropdown
              allGrains={ALL_GRAINS}
              unlockedGrains={unlockedGrains}
            />
            <Link
              href="/my-farm"
              className="px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
            >
              My Farm
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Suspense
            fallback={<Skeleton className="hidden sm:block h-4 w-32" />}
          >
            <CgcFreshness />
          </Suspense>
          <ThemeToggle />
          <MobileNav
            allGrains={ALL_GRAINS}
            unlockedGrains={unlockedGrains}
          />
        </div>
      </div>
    </header>
  );
}
