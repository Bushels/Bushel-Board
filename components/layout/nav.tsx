import Link from "next/link";
import { Suspense } from "react";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import { CgcFreshness } from "./cgc-freshness";
import { Logo } from "./logo";
import { DesktopNavLinks } from "./desktop-nav-links";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { getUserUnlockedGrains } from "@/lib/queries/crop-plans";
import { ALL_GRAINS } from "@/lib/constants/grains";

export async function Nav() {
  // Fetch the current user's unlocked grains and email
  let unlockedGrains: string[] = [];
  let userEmail: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      unlockedGrains = await getUserUnlockedGrains(user.id);
      userEmail = user.email ?? null;
    }
  } catch {
    // If auth fails (e.g. no cookies context), show all grains as locked
  }

  return (
    <header className="sticky top-0 z-50 px-4 pt-3">
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[1.65rem] border border-white/50 bg-background/80 shadow-[0_18px_45px_-28px_rgba(42,38,30,0.65)] backdrop-blur-2xl dark:border-white/10 dark:bg-wheat-900/78">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/10" />
          <div className="flex min-h-[4.25rem] items-center justify-between gap-4 px-4 sm:px-5">
            <div className="flex items-center gap-4 sm:gap-6">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 transition-colors hover:bg-white/45 dark:hover:bg-white/6"
              >
                <Logo size={28} />
                <span className="text-lg font-semibold font-display text-canola">
                  Bushel Board
                </span>
              </Link>
              <DesktopNavLinks
                allGrains={ALL_GRAINS}
                unlockedGrains={unlockedGrains}
              />
            </div>
            <div className="flex items-center gap-2">
              <Suspense
                fallback={<Skeleton className="hidden h-9 w-32 rounded-full sm:block" />}
              >
                <CgcFreshness />
              </Suspense>
              <ThemeToggle />
              {userEmail && <UserMenu email={userEmail} />}
              <MobileNav
                allGrains={ALL_GRAINS}
                unlockedGrains={unlockedGrains}
                userEmail={userEmail}
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
