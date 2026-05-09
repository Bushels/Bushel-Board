import { redirect } from "next/navigation";

/**
 * /advisor — legacy route name for the Bushy chat advisor.
 * Redirects to /chat to preserve the link's original intent.
 *
 * Audit P2.2 fix (2026-04-27 cohesion audit). Stale bookmarks,
 * marketing-email deep-links, and any cached /advisor references
 * land on the chat surface they were aiming at instead of being
 * silently relocated to /.
 */
export default function AdvisorPage() {
  redirect("/chat");
}
