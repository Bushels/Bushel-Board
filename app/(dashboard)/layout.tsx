import { Nav } from "@/components/layout/nav";
import { ErrorBoundary } from "@/components/error-boundary";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
