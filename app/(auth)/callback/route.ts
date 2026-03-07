import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Detect password recovery flow and redirect to update-password page
      const type = searchParams.get("type");
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/update-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error — redirect to login with error indicator
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
