import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export type UserRole = "farmer" | "observer";

export interface AuthenticatedUserContext {
  user: User | null;
  role: UserRole;
}

/**
 * Get the current authenticated user and their role.
 * Missing profiles default to observer so writes remain deny-by-default.
 */
export async function getAuthenticatedUserContext(): Promise<AuthenticatedUserContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, role: "observer" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role as UserRole | undefined) ?? "observer";

  return { user, role };
}

/**
 * Get the current user's role from their profile.
 * Returns 'observer' as fallback for unauthenticated users.
 * Call from Server Components only.
 */
export async function getUserRole(): Promise<UserRole> {
  const { role } = await getAuthenticatedUserContext();
  return role;
}

/**
 * Check if a role is an observer (read-only browsing).
 * Use in client components where role is passed as a prop.
 */
export function isObserver(role: UserRole): boolean {
  return role === "observer";
}
