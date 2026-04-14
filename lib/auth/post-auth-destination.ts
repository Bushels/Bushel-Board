import type { SupabaseClient, User } from "@supabase/supabase-js";

type PostAuthDestination = "/chat" | "/my-farm" | "/overview";

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
  // Chat-first: all authenticated users land on Bushy chat
  if (!user) {
    return "/overview";
  }
  return "/chat";
}
