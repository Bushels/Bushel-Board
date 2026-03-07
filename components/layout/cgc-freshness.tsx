import { createClient } from "@/lib/supabase/server";

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
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-muted" />
          No data
        </div>
      );
    }

    const importDate = new Date(data.imported_at);
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const daysSince = Math.floor(
      (now - importDate.getTime()) / 86400000
    );
    const isFresh = daysSince <= 7;

    return (
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className={`h-2 w-2 rounded-full ${
            isFresh ? "bg-prairie animate-pulse" : "bg-canola"
          }`}
        />
        CGC Wk {data.grain_week} · {data.crop_year}
      </div>
    );
  } catch {
    // Supabase not configured or no data yet
    return (
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-muted" />
        CGC Data
      </div>
    );
  }
}
