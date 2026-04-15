import { authorizeCronRequest, pausedCronResponse } from "@/lib/cron/route-guards";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = authorizeCronRequest(request);
  if (authError) return authError;

  return pausedCronResponse(
    "import-cftc-cot",
    "CFTC automation is intentionally paused until the import path and Advisor usage are finalized."
  );
}
