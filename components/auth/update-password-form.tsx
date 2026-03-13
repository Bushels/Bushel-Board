"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth/auth-shell";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthScene } from "@/lib/auth/auth-scene";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface UpdatePasswordFormProps {
  scene: AuthScene;
}

export function UpdatePasswordForm({ scene }: UpdatePasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setDone(true);
    setTimeout(() => router.push("/overview"), 2000);
  }

  return (
    <AuthShell scene={scene} modeLabel="Update password">
      <Card className="w-full border-white/50 bg-background/88 shadow-[0_28px_80px_-42px_rgba(42,38,30,0.72)] backdrop-blur-2xl dark:border-white/10 dark:bg-wheat-900/88">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex size-14 items-center justify-center rounded-full border border-canola/20 bg-canola/10">
              <Logo variant="mark" size={26} />
            </div>
          </div>
          <CardTitle className="text-2xl font-display text-canola">
            Set New Password
          </CardTitle>
          <CardDescription>
            Choose a new password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-4 text-center">
              <p className="font-medium text-prairie">
                Password updated successfully
              </p>
              <p className="text-sm text-muted-foreground">
                Redirecting to your dashboard...
              </p>
            </div>
          ) : (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              {error && <p className="text-sm text-error">{error}</p>}
              <Button
                type="submit"
                className="w-full bg-canola text-white hover:bg-canola-dark"
                disabled={loading}
              >
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
