import { createClient } from "@/lib/supabase/server";

export type UserRole = "farmer" | "observer";

/**
 * Get the current user's role from their profile.
 * Returns 'observer' as fallback for unauthenticated users.
 * Call from Server Components only.
 */
export async function getUserRole(): Promise<UserRole> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "observer";

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return (profile?.role as UserRole) ?? "farmer";
}

/**
 * Check if a role is an observer (read-only browsing).
 * Use in client components where role is passed as a prop.
 */
export function isObserver(role: UserRole): boolean {
  return role === "observer";
}
