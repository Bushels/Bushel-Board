import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

export interface ProcessorCapacity {
  grain: string;
  annual_capacity_kt: number;
  source: string;
  is_approximate: boolean;
  notes: string | null;
}

export async function getProcessorCapacity(
  grainName: string,
  cropYear?: string
): Promise<ProcessorCapacity | null> {
  const supabase = await createClient();
  const year = cropYear ?? CURRENT_CROP_YEAR;

  const { data, error } = await supabase
    .from("processor_capacity")
    .select("grain, annual_capacity_kt, source, is_approximate, notes")
    .eq("grain", grainName)
    .eq("crop_year", year)
    .single();

  if (error || !data) return null;

  return {
    grain: String(data.grain),
    annual_capacity_kt: Number(data.annual_capacity_kt),
    source: String(data.source),
    is_approximate: Boolean(data.is_approximate),
    notes: data.notes ? String(data.notes) : null,
  };
}
