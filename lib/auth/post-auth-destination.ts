import type { SupabaseClient, User } from "@supabase/supabase-js";

type PostAuthDestination = "/my-farm" | "/thesis";

export async function getPostAuthDestination(
  supabase: SupabaseClient,
  user: User | null
): Promise<PostAuthDestination> {
  // Chat surface temporarily disabled — route everyone to /thesis (the flagship board; /overview hidden 2026-06-10).
  // Restore /chat-first routing when Bushy chat is brought back.
  void supabase;
  void user;
  return "/thesis";
}
