import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DigestView } from "./digest-view";

export const dynamic = "force-dynamic";

/**
 * /digest — Daily operational briefing for bu/ac.
 * Gated by OWNER_USER_ID env var. Unauthorized users are redirected home.
 */
export default async function DigestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Gate: only bu/ac can see this page
  const ownerUserId = process.env.OWNER_USER_ID;
  if (!ownerUserId || user.id !== ownerUserId) {
    redirect("/");
  }

  // Generate today's digest via service-role RPC
  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const { data: digest, error } = await admin.rpc("generate_daily_digest", {
    p_date: today,
  });

  if (error) {
    console.error("Digest generation error:", error);
    return (
      <div className="mx-auto max-w-3xl py-8">
        <h1 className="text-xl font-bold text-foreground">Daily Digest</h1>
        <p className="mt-2 text-sm text-red-500">
          Error generating digest: {error.message}
        </p>
      </div>
    );
  }

  return <DigestView data={digest} />;
}
