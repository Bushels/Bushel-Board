"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ResetPasswordPage() {
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
    <div className="min-h-screen flex items-center justify-center bg-wheat-50 dark:bg-wheat-900 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-display text-canola">
            Reset Password
          </CardTitle>
          <CardDescription>
            We&apos;ll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="text-center space-y-4">
              <p className="text-prairie font-medium">Check your email</p>
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
              {error && (
                <p className="text-sm text-error">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full bg-canola hover:bg-canola-dark text-white"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
              <p className="text-sm text-center">
                <Link
                  href="/login"
                  className="text-muted-foreground hover:text-canola transition-colors"
                >
                  Back to login
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
