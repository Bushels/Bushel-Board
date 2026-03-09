import { createClient } from "@/lib/supabase/server";

export interface GrainOverviewRow {
  grain: string;
  slug: string;
  display_order: number;
  cy_deliveries_kt: number;
  cw_deliveries_kt: number;
  prev_deliveries_kt: number;
  wow_pct_change: number;
}

/**
 * Fetch the grain overview for the dashboard — latest week summary per grain.
 * Queries the v_grain_overview view which aggregates deliveries across provinces.
 */
export async function getGrainOverview(): Promise<GrainOverviewRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("v_grain_overview")
      .select("*")
      .order("display_order");

    if (error) {
      console.error("getGrainOverview error:", error.message);
      return [];
    }
    return (data as GrainOverviewRow[]) || [];
  } catch (err) {
    // Supabase may not be configured yet or views may not exist
    console.error("getGrainOverview failed:", err);
    return [];
  }
}

export interface Grain {
  id: string;
  name: string;
  slug: string;
  category: string;
  display_order: number;
}

/**
 * Fetch a single grain by slug.
 */
export async function getGrainBySlug(slug: string): Promise<Grain | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("grains")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error) {
      console.error("getGrainBySlug error:", error.message);
      return null;
    }
    return data as Grain;
  } catch (err) {
    console.error("getGrainBySlug failed:", err);
    return null;
  }
}

/**
 * Fetch a single grain's overview row from v_grain_overview.
 * Returns CW/CY deliveries that include both Primary + Process pathways.
 */
export async function getGrainOverviewBySlug(
  slug: string
): Promise<GrainOverviewRow | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("v_grain_overview")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error) {
      console.error("getGrainOverviewBySlug error:", error.message);
      return null;
    }
    return data as GrainOverviewRow;
  } catch (err) {
    console.error("getGrainOverviewBySlug failed:", err);
    return null;
  }
}

/**
 * Fetch all grains ordered by display order.
 */
export async function getGrainList(): Promise<
  { name: string; slug: string; display_order: number }[]
> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("grains")
      .select("name, slug, display_order")
      .eq("category", "Canadian")
      .order("display_order");

    if (error) {
      console.error("getGrainList error:", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("getGrainList failed:", err);
    return [];
  }
}
