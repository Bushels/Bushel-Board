import { redirect } from "next/navigation";
import { getCommunityStats } from "@/lib/queries/community";
import { LandingPage } from "@/components/landing/landing-page";
import { getEnrolledAcres } from "@/components/landing/trial-actions";
import { getPostAuthDestination } from "@/lib/auth/post-auth-destination";
import { createClient } from "@/lib/supabase/server";

export default async function RootPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect(await getPostAuthDestination(supabase, user));
    }
  } catch {
    // If auth resolution fails, fall back to the public landing page.
  }

  const [communityStats, initialTrialAcres] = await Promise.all([
    getCommunityStats(),
    getEnrolledAcres(),
  ]);

  return <LandingPage communityStats={communityStats} initialTrialAcres={initialTrialAcres} />;
}
