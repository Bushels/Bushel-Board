"use client";

import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

interface UserMenuProps {
  email: string;
}

export function UserMenu({ email }: UserMenuProps) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="User menu"
          className="hidden rounded-full border border-white/40 bg-white/35 shadow-[0_14px_32px_-22px_rgba(42,38,30,0.55)] backdrop-blur-xl hover:bg-white/55 dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/10 md:inline-flex"
        >
          <User className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-3xl border border-white/50 bg-background/92 shadow-[0_24px_50px_-24px_rgba(42,38,30,0.55)] backdrop-blur-2xl dark:border-white/10 dark:bg-wheat-900/90"
      >
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
