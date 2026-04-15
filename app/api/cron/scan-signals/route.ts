import { authorizeCronRequest, pausedCronResponse } from "@/lib/cron/route-guards";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = authorizeCronRequest(request);
  if (authError) return authError;

  return pausedCronResponse(
    "scan-signals",
    "Signal scanning automation is intentionally paused while the Advisor and pipeline behavior are being validated."
  );
}
