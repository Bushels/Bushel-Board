# Handover: 2026-03-11 Farmer-First Onboarding

## Session Summary

Implemented the farmer-first onboarding and trust pass across auth, landing, overview, `My Farm`, navigation, and X feed surfaces. The app now routes farmers to `My Farm` first, explains why farm inputs matter, makes locked states honest, and lets users click through to X posts instead of trusting summaries blindly.

This pass followed the local `frontend-dev`, `ui-agent`, and `documentation-agent` playbooks. The visual direction centered on premium glass navigation, clearer empty states, and lower-friction unlock messaging.

## Completed Tasks

- [x] Routed farmers to `My Farm` after login, signup, and signed-in landing redirects
- [x] Rewrote landing and auth copy to explain immediate value and the unlock ladder
- [x] Made overview fallback grains explicit instead of masquerading as personalized/unlocked content
- [x] Reworked `My Farm` first-run and no-delivery empty states around one obvious next action
- [x] Added glassmorphism nav polish for desktop, mobile, dropdowns, freshness, theme toggle, and user menu
- [x] Added outbound X clickthrough to ticker and main X feed, plus schema support for canonical post URLs
- [x] Cleaned encoding/polish issues in metadata and freshness/status copy
- [x] Recorded the UX decisions and analytics plan in docs
- [x] Reworked the landing page again to remove the competing header CTA, restore a clear Bushel Board brand anchor, and quiet sign-in as a secondary action
- [x] Fixed the dashboard header brand duplication by removing the extra wordmark beside the full logo lockup
- [x] Replaced the overview/grain X ticker ribbon with post-style cards so the feed reads like verifiable source content

## In Progress

- [ ] Product analytics implementation - event taxonomy is documented, but no collector/event pipeline was added yet
- [ ] Deploy database migration and updated `search-x-intelligence` function to Supabase
- [ ] Optional live Playwright pass after deployment to verify the farmer-first flow against production data

## Key Decisions Made

1. **Farmers land on `My Farm` first:** New and returning farmers should reach the page where they can unlock value immediately. `Overview` remains useful, but it is not the best first screen for a skeptical farmer.
2. **Unlock messaging must be value-led:** The app now explains that acres unlock the page now, while tonnes, deliveries, and signal feedback sharpen AI and weekly summaries over time.
3. **Fallback content must stay visibly non-personalized:** Showing prairie snapshots is fine, but they must not look like unlocked farm-specific content.
4. **Summarized X signals need source verification:** Every trust-sensitive signal card should offer direct clickthrough to the underlying post whenever possible.
5. **The full Bushel Board lockup counts as the wordmark:** If the header uses the lockup SVG, do not render a second adjacent `Bushel Board` text label.

## Issues Encountered

1. **Encoding residue in a few strings:** Some UI/docs files contained mojibake from prior edits. Rewrote the small affected files instead of trying to patch single corrupted glyphs in place.
2. **`XSignalFeed` had no post clickthrough despite new query support:** Fixed the UI and completed the data path by adding `post_url` to the X signal schema and RPCs.

## Next Steps (Priority Order)

1. Apply `supabase/migrations/20260311121500_x_market_signal_post_urls.sql` and deploy `supabase/functions/search-x-intelligence`
2. Implement the first analytics collector around the documented onboarding funnel
3. Confirm the dashboard header and new X post-card layout against a signed-in farmer account on the latest preview

## Files Modified This Session

- `lib/auth/post-auth-destination.ts` - centralized farmer/observer post-auth routing
- `app/(auth)/login/page.tsx` - farmer-first login destination and clearer value copy
- `app/(auth)/signup/page.tsx` - farmer-first signup destination and unlock explanation
- `components/landing/landing-page.tsx` - honest hero copy and value framing
- `components/layout/logo.tsx` - normalized the lockup aspect ratio and reusable sizing
- `app/(dashboard)/overview/page.tsx` - separated fallback grain display from unlock state
- `app/(dashboard)/my-farm/page.tsx` - stronger farmer-first framing
- `app/(dashboard)/my-farm/client.tsx` - new first-run hero, unlock ladder, and no-delivery empty state
- `components/dashboard/farm-summary-card.tsx` - value-led empty states for weekly summary
- `app/(dashboard)/grain/[slug]/page.tsx` - clearer trust/value copy and signal tape wiring
- `components/dashboard/signal-tape.tsx` - clickable X cards/ticker with canonical or search fallback URLs
- `components/dashboard/x-signal-feed.tsx` - clickable "Open post" action plus clearer feed rationale
- `components/layout/nav.tsx` - floating glass nav shell
- `components/layout/desktop-nav-links.tsx` - active-state desktop nav
- `components/dashboard/signal-tape.tsx` - converted ticker ribbon into X-style post cards
- `components/layout/mobile-nav.tsx` - polished mobile navigation and onboarding callout
- `components/layout/grain-dropdown.tsx` - honest unlock-aware grain access
- `components/layout/cgc-freshness.tsx` - polished freshness pill and encoding cleanup
- `components/layout/theme-toggle.tsx` - glass button treatment
- `components/layout/user-menu.tsx` - glass dropdown treatment
- `app/layout.tsx` - metadata cleanup
- `supabase/functions/search-x-intelligence/index.ts` - canonical X post URL request/storage
- `supabase/migrations/20260311121500_x_market_signal_post_urls.sql` - `post_url` column and RPC updates
- `docs/reference/farmer-first-onboarding-and-analytics.md` - UX and analytics reference
- `docs/lessons-learned/issues.md` - trust/onboarding and X-link lessons captured

## Verification

- `npm run build`
- `npm run test`

## Environment Notes

- Repo was already dirty before this pass; unrelated user changes were left untouched.
- Migration/function changes are coded locally only until `npx supabase db push` and function deploy happen.
