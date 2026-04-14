"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GrainDropdown } from "@/components/layout/grain-dropdown";
import type { GrainDef } from "@/lib/constants/grains";
import { cn } from "@/lib/utils";

interface DesktopNavLinksProps {
  allGrains: GrainDef[];
  unlockedGrains: string[];
}

function navLinkClasses(isActive: boolean) {
  return cn(
    "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition-all duration-200",
    isActive
      ? "bg-white/80 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_12px_30px_-20px_rgba(42,38,30,0.45)] dark:bg-white/10 dark:text-wheat-50"
      : "text-muted-foreground hover:bg-white/60 hover:text-foreground dark:hover:bg-white/8 dark:hover:text-wheat-50"
  );
}

export function DesktopNavLinks({
  allGrains,
  unlockedGrains,
}: DesktopNavLinksProps) {
  const pathname = usePathname();

  return (
    <nav className="hidden shrink-0 items-center gap-1 rounded-full border border-white/35 bg-white/30 p-1 shadow-[0_18px_40px_-28px_rgba(42,38,30,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5 md:flex">
      <Link href="/overview" className={navLinkClasses(pathname.startsWith("/overview"))}>
        Overview
      </Link>
      <GrainDropdown allGrains={allGrains} unlockedGrains={unlockedGrains} />
      <Link href="/my-farm" className={navLinkClasses(pathname.startsWith("/my-farm"))}>
        My Farm
      </Link>
      <Link href="/us" className={navLinkClasses(pathname.startsWith("/us"))}>
        US Markets
      </Link>
      <Link href="/advisor" className={navLinkClasses(pathname.startsWith("/advisor"))}>
        Advisor
      </Link>
    </nav>
  );
}
