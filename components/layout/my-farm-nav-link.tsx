"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Standalone My Farm nav link, rendered in the right cluster of the
 * dashboard header (next to freshness / theme / user menu).
 *
 * Visually matches the inactive/active pill styles used by
 * DesktopNavLinks so the right-anchored tab feels like part of the
 * same nav system, just spatially separated.
 */
export function MyFarmNavLink() {
  const pathname = usePathname();
  const isActive = pathname.startsWith("/my-farm");

  return (
    <Link
      href="/my-farm"
      className={cn(
        "hidden h-10 items-center rounded-full border px-4 text-sm font-medium shadow-[0_14px_32px_-22px_rgba(42,38,30,0.55)] backdrop-blur-xl transition-all duration-200 md:inline-flex",
        isActive
          ? "border-white/45 bg-white/80 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_12px_30px_-20px_rgba(42,38,30,0.45)] dark:border-white/15 dark:bg-white/12 dark:text-wheat-50"
          : "border-white/40 bg-white/35 text-muted-foreground hover:bg-white/55 hover:text-foreground dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/10 dark:hover:text-wheat-50"
      )}
    >
      My Farm
    </Link>
  );
}
