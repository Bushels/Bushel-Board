import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp, MapPin } from "lucide-react";
import { Logo } from "@/components/layout/logo";

export default async function RootPage() {
  // Check if user is authenticated — if so, redirect to dashboard
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/overview");
    }
  } catch {
    // Supabase not configured — show landing page
  }

  return <LandingPage />;
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-wheat-50 dark:bg-wheat-900">
      {/* Header */}
      <header className="mx-auto max-w-5xl px-4 py-6 flex items-center justify-between">
        <span className="font-display text-xl text-canola font-semibold flex items-center gap-2">
          <Logo /> Bushel Board
        </span>
        <Link href="/login">
          <Button variant="outline" size="sm">
            Sign In
          </Button>
        </Link>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-16 text-center space-y-8">
        <div className="flex justify-center mb-6">
          <Logo size={120} />
        </div>
        <h1 className="text-4xl sm:text-5xl font-display font-bold leading-tight">
          Prairie Grain Market
          <br />
          <span className="text-canola">Intelligence</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Real-time Canadian grain statistics, delivered every Thursday from the
          Canadian Grain Commission. Built for farmers in Alberta, Saskatchewan,
          and Manitoba.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/signup">
            <Button
              size="lg"
              className="bg-canola hover:bg-canola-dark text-white"
            >
              Get Started
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Free during early access. No credit card required.
        </p>
      </main>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureBlock
            icon={<BarChart3 className="h-8 w-8 text-canola" />}
            title="Weekly CGC Data"
            description="Automatic imports of Canadian Grain Commission statistics every Thursday. Deliveries, shipments, and stocks at a glance."
          />
          <FeatureBlock
            icon={<MapPin className="h-8 w-8 text-province-ab" />}
            title="Provincial Breakdown"
            description="Compare grain activity across Alberta, Saskatchewan, and Manitoba with province-level detail."
          />
          <FeatureBlock
            icon={<TrendingUp className="h-8 w-8 text-prairie" />}
            title="Trend Analysis"
            description="Track week-over-week changes, crop year totals, and seasonal patterns across 16 grain types."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <p>
          Data source:{" "}
          <a
            href="https://www.grainscanada.gc.ca"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-canola transition-colors"
          >
            Canadian Grain Commission
          </a>
        </p>
      </footer>
    </div>
  );
}

function FeatureBlock({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center space-y-3 p-6">
      <div className="flex justify-center">{icon}</div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
