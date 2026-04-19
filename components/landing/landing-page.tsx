"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { CommunityStatsDisplay } from "@/components/dashboard/community-stats";
import { PrairieScene } from "@/components/ui/prairie-scene";
import { TrialDeskSection } from "@/components/landing/trial-desk-section";
import type { CommunityStats } from "@/lib/queries/community";

interface LandingPageProps {
  communityStats: CommunityStats | null;
  initialTrialAcres: number;
}

export function LandingPage({ communityStats, initialTrialAcres }: LandingPageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden font-sans">
      <PrairieScene />

      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 mx-auto flex max-w-6xl items-center justify-start px-4 pt-6 sm:px-6"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 rounded-[1.4rem] border border-white/30 bg-white/20 px-3 py-2 shadow-[0_14px_32px_-24px_rgba(42,38,30,0.55)] backdrop-blur-xl transition-colors hover:bg-white/28"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-white/90 shadow-sm">
            <Logo variant="mark" size={18} />
          </span>
          <span className="text-sm font-semibold tracking-wide text-white">
            Bushel Board
          </span>
        </Link>
      </motion.header>

      <main className="relative z-10 mx-auto flex min-h-[70vh] max-w-4xl flex-col items-center justify-center space-y-6 px-4 pb-20 pt-10 text-center">

        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
          className="text-5xl font-display font-black leading-[1.1] tracking-tight text-white sm:text-7xl"
          style={{ textShadow: "0 2px 20px rgba(0,0,0,0.3)" }}
        >
          Know what changed <br />
          <span
            className="text-canola"
            style={{ textShadow: "0 2px 20px rgba(0,0,0,0.2)" }}
          >
            before you sell.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
          className="mx-auto max-w-2xl text-lg leading-relaxed text-white/80"
          style={{ textShadow: "0 1px 10px rgba(0,0,0,0.3)" }}
        >
          Bushel Board combines weekly CGC prairie grain data, live X market
          signals, and your farm inputs to show what moved, what matters, and
          what deserves attention before you call the elevator.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.43, ease: "easeOut" }}
          className="flex flex-wrap items-center justify-center gap-3"
        >
          <ProofPill label="Weekly CGC refresh" />
          <ProofPill label="Live X market signals" />
          <ProofPill label="Farm data unlocks sharper AI" />
        </motion.div>

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
              className="rounded-full bg-canola px-10 py-6 text-lg text-white shadow-[0_4px_24px_rgba(193,127,36,0.4)] transition-all hover:-translate-y-1 hover:bg-canola-dark"
            >
              Set Up My Farm
            </Button>
          </Link>
          <p className="max-w-xl text-center text-sm text-white/75">
            Start with one crop. Add acres now, then sharpen your AI insight with
            starting grain, remaining tonnes, deliveries, and signal feedback over time.
          </p>
          <p className="text-sm text-white/72">
            Already using Bushel Board?{" "}
            <Link
              href="/login"
              className="font-medium text-white underline decoration-white/40 underline-offset-4 transition-colors hover:decoration-white"
            >
              Sign in
            </Link>
          </p>
        </motion.div>

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

      <TrialDeskSection initialAcres={initialTrialAcres} />

      <footer className="relative z-10 py-8 text-center text-sm text-white/60">
        <p>&copy; {new Date().getFullYear()} Bushel Board.</p>
      </footer>
    </div>
  );
}

function ProofPill({ label }: { label: string }) {
  return (
    <div className="rounded-full border border-white/35 bg-white/15 px-4 py-2 text-sm text-white shadow-[0_10px_24px_-16px_rgba(42,38,30,0.55)] backdrop-blur-xl">
      {label}
    </div>
  );
}
