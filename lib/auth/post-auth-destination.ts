import type { SupabaseClient, User } from "@supabase/supabase-js";

type PostAuthDestination = "/my-farm" | "/overview";

function getRoleFromMetadata(user: User | null): string | null {
  if (!user) {
    return null;
  }

  const role = user.user_metadata?.role;
  return typeof role === "string" ? role : null;
}

export async function getPostAuthDestination(
  supabase: SupabaseClient,
  user: User | null
): Promise<PostAuthDestination> {
  // Chat surface temporarily disabled — route everyone to /overview.
  // Restore /chat-first routing when Bushy chat is brought back.
  return "/overview";
}
