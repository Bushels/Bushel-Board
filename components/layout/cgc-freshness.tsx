import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { getDisplayWeek } from "@/lib/queries/data-freshness";

const freshnessBadgeClasses =
  "hidden items-center gap-1.5 rounded-full border border-white/40 bg-white/35 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-xl dark:border-white/10 dark:bg-white/6 sm:flex";

export async function CgcFreshness() {
  try {
    const displayWeek = await getDisplayWeek();

    // Check freshness from the latest import timestamp
    const supabase = await createClient();
    const { data } = await supabase
      .from("cgc_imports")
      .select("imported_at")
      .eq("status", "success")
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isFresh = data
      ? Math.floor((Date.now() - new Date(data.imported_at).getTime()) / 86400000) <= 7
      : false;

    return (
      <div className={freshnessBadgeClasses}>
        <span
          className={`h-2 w-2 rounded-full ${
            isFresh ? "bg-prairie animate-pulse" : "bg-canola"
          }`}
        />
        Wk {displayWeek} · {CURRENT_CROP_YEAR}
      </div>
    );
  } catch {
    return (
      <div className={freshnessBadgeClasses}>
        <span className="h-2 w-2 rounded-full bg-muted" />
        CGC Data
      </div>
    );
  }
}
