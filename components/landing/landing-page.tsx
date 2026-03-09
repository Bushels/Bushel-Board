"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BarChart3, Database, ClipboardList, ChevronDown } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { PrairieScene } from "@/components/ui/prairie-scene";
import { motion } from "framer-motion";
import type { CommunityStats } from "@/lib/queries/community";
import { CommunityStatsDisplay } from "@/components/dashboard/community-stats";

interface LandingPageProps {
  communityStats: CommunityStats | null;
}

export function LandingPage({ communityStats }: LandingPageProps) {
  const router = useRouter();

  useEffect(() => {
    async function checkUser() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        router.push("/overview");
      }
    }
    checkUser();
  }, [router]);

  return (
    <div className="relative min-h-screen overflow-hidden font-sans">
      {/* Prairie Background */}
      <PrairieScene />

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 mx-auto max-w-6xl px-6 py-6 flex items-center justify-end"
      >
        <Link href="/login">
          <Button
            variant="outline"
            className="bg-white/20 border-white/30 hover:bg-white/40 text-white shadow-sm backdrop-blur-sm rounded-full px-6"
          >
            Sign In
          </Button>
        </Link>
      </motion.header>

      {/* Hero — overlaid on the prairie scene */}
      <main className="relative z-10 mx-auto max-w-4xl px-4 pt-4 pb-20 text-center space-y-6 min-h-[70vh] flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          className="flex justify-center mb-6"
        >
          <Logo size={120} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
          className="text-5xl sm:text-7xl font-display font-black leading-[1.1] text-white tracking-tight"
          style={{ textShadow: "0 2px 20px rgba(0,0,0,0.3)" }}
        >
          Deliver <br />
          <span className="text-canola" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.2)" }}>
            with Data.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
          className="text-lg text-white/80 max-w-2xl mx-auto leading-relaxed"
          style={{ textShadow: "0 1px 10px rgba(0,0,0,0.3)" }}
        >
          Harness your farm&apos;s production metrics to uncover clear insights.
          Make confident, well-timed decisions on when to hold and when to sell
          your grain.
        </motion.p>

        {communityStats && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45, ease: "easeOut" }}
          >
            <CommunityStatsDisplay stats={communityStats} variant="hero" />
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center gap-5 pt-6"
        >
          <Link href="/signup">
            <Button
              size="lg"
              className="bg-canola hover:bg-canola-dark text-white px-10 py-6 text-lg rounded-full shadow-[0_4px_24px_rgba(193,127,36,0.4)] transition-all hover:-translate-y-1"
            >
              Get Started
            </Button>
          </Link>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <ChevronDown className="h-6 w-6 text-white/50" />
          </motion.div>
        </motion.div>
      </main>

      {/* Features — below the fold */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 py-16 pb-32 bg-wheat-50 dark:bg-wheat-900">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          <FeatureBlock
            icon={<Database className="h-7 w-7 text-canola" />}
            title="Track Inventory"
            description="Quietly log your acreage, harvests, and contracts to build a private, comprehensive view of your entire operation."
            delay={0.2}
          />
          <FeatureBlock
            icon={<ClipboardList className="h-7 w-7 text-canola" />}
            title="Analyze Margins"
            description="Understand your delivery pace, progress, and exact profitability margins at a glance with clear, actionable visuals."
            delay={0.3}
          />
          <FeatureBlock
            icon={<BarChart3 className="h-7 w-7 text-canola" />}
            title="Sell with Confidence"
            description="Use your localized numbers to make perfectly timed sales decisions, minimizing risk and maximizing your farm's revenue."
            delay={0.4}
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 text-center text-sm text-wheat-400 bg-wheat-50 dark:bg-wheat-900">
        <p>&copy; {new Date().getFullYear()} Bushel Board.</p>
      </footer>
    </div>
  );
}

function FeatureBlock({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className="p-8 rounded-[2rem] bg-white dark:bg-wheat-800 border border-wheat-100 dark:border-wheat-700 shadow-sm hover:shadow-xl transition-all duration-300 text-left space-y-5"
    >
      <div className="inline-flex p-4 rounded-xl bg-wheat-50 dark:bg-wheat-700 border border-wheat-100 dark:border-wheat-600">
        {icon}
      </div>
      <h3 className="font-display text-xl font-bold text-wheat-900 dark:text-wheat-100">
        {title}
      </h3>
      <p className="text-wheat-500 dark:text-wheat-300 leading-relaxed text-base">
        {description}
      </p>
    </motion.div>
  );
}
