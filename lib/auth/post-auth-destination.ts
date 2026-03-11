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
  const metadataRole = getRoleFromMetadata(user);
  if (metadataRole === "farmer") {
    return "/my-farm";
  }

  if (metadataRole === "observer") {
    return "/overview";
  }

  if (!user) {
    return "/overview";
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.role === "farmer" ? "/my-farm" : "/overview";
}
