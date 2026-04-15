export function authorizeCronRequest(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return Response.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function pausedCronResponse(job: string, reason: string): Response {
  return Response.json(
    {
      paused: true,
      job,
      reason,
    },
    { status: 200 }
  );
}
