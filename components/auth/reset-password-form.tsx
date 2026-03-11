"use client";

import { useState } from "react";
import Link from "next/link";
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

interface ResetPasswordFormProps {
  scene: AuthScene;
}

export function ResetPasswordForm({ scene }: ResetPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/callback?type=recovery` }
    );

    if (resetError) {
      setError(resetError.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <AuthShell scene={scene} modeLabel="Reset password">
      <Card className="w-full border-white/50 bg-background/88 shadow-[0_28px_80px_-42px_rgba(42,38,30,0.72)] backdrop-blur-2xl dark:border-white/10 dark:bg-wheat-900/88">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex size-14 items-center justify-center rounded-full border border-canola/20 bg-canola/10">
              <Logo variant="mark" size={26} />
            </div>
          </div>
          <CardTitle className="text-2xl font-display text-canola">
            Reset Password
          </CardTitle>
          <CardDescription>
            We&apos;ll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="font-medium text-prairie">Check your email</p>
              <p className="text-sm text-muted-foreground">
                We sent a reset link to <strong>{email}</strong>.
              </p>
              <Link href="/login">
                <Button variant="outline" className="mt-2">
                  Back to login
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="farmer@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-error">{error}</p>}
              <Button
                type="submit"
                className="w-full bg-canola text-white hover:bg-canola-dark"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
              <p className="text-center text-sm">
                <Link
                  href="/login"
                  className="text-muted-foreground transition-colors hover:text-canola"
                >
                  Back to login
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
