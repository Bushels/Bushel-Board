import { getCommunityStats } from "@/lib/queries/community";
import { LandingPage } from "@/components/landing/landing-page";

export default async function RootPage() {
  const communityStats = await getCommunityStats();

  return <LandingPage communityStats={communityStats} />;
}
