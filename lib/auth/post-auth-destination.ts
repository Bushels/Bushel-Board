import type { SupabaseClient, User } from "@supabase/supabase-js";

type PostAuthDestination = "/my-farm" | "/overview";

export async function getPostAuthDestination(
  supabase: SupabaseClient,
  user: User | null
): Promise<PostAuthDestination> {
  // Chat surface temporarily disabled — route everyone to /overview.
  // Restore /chat-first routing when Bushy chat is brought back.
  void supabase;
  void user;
  return "/overview";
}
