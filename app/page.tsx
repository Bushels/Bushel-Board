import { redirect } from "next/navigation";

/**
 * Public-first home: every visitor — auth'd or not — lands on /overview,
 * which is the live product surface and now serves as the marketing too.
 *
 * The previous LandingPage (gated sign-up funnel) was deleted on
 * 2026-04-28: components/landing/* and app/api/trial-notify/route.ts
 * are gone. See STATUS Tracks 47 + 13 + 45 for context.
 */
export default function RootPage() {
  redirect("/overview");
}
