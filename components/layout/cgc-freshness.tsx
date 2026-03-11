import { createClient } from "@/lib/supabase/server";

const freshnessBadgeClasses =
  "hidden items-center gap-1.5 rounded-full border border-white/40 bg-white/35 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-xl dark:border-white/10 dark:bg-white/6 sm:flex";

export async function CgcFreshness() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("cgc_imports")
      .select("grain_week, crop_year, imported_at")
      .eq("status", "success")
      .order("imported_at", { ascending: false })
      .limit(1)
      .single();

    if (!data) {
      return (
        <div className={freshnessBadgeClasses}>
          <span className="h-2 w-2 rounded-full bg-muted" />
          No data
        </div>
      );
    }

    const importDate = new Date(data.imported_at);
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const daysSince = Math.floor((now - importDate.getTime()) / 86400000);
    const isFresh = daysSince <= 7;

    return (
      <div className={freshnessBadgeClasses}>
        <span
          className={`h-2 w-2 rounded-full ${
            isFresh ? "bg-prairie animate-pulse" : "bg-canola"
          }`}
        />
        CGC Wk {data.grain_week} · {data.crop_year}
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
