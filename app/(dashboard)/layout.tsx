import { Nav } from "@/components/layout/nav";
import { ErrorBoundary } from "@/components/error-boundary";
import { getCommunityStats } from "@/lib/queries/community";
import { CommunityStatsDisplay } from "@/components/dashboard/community-stats";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const communityStats = await getCommunityStats();

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      {communityStats && (
        <CommunityStatsDisplay stats={communityStats} variant="footer" />
      )}
    </div>
  );
}
