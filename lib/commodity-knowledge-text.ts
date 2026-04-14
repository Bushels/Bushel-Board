/**
 * Re-export of COMMODITY_KNOWLEDGE for use in Next.js/Vitest context.
 * The Edge Function version imports from a Deno-targeted path, so the app-side
 * re-export should point at the local TypeScript-friendly extract.
 */
export { COMMODITY_KNOWLEDGE } from "@/lib/advisor/commodity-knowledge-extract";
