"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/layout/logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [farmName, setFarmName] = useState("");
  const [farmerName, setFarmerName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    // 1. Create the auth account
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          farm_name: farmName,
          farmer_name: farmerName,
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // 2. Update the auto-created profile with farm info
    if (authData.user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          farm_name: farmName,
          farmer_name: farmerName,
          postal_code: postalCode.trim().toUpperCase(),
        })
        .eq("id", authData.user.id);

      if (profileError) {
        console.error("Profile update error:", profileError.message);
        // Don't block signup — profile can be updated later
      }
    }

    router.push("/overview");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-wheat-50 dark:bg-wheat-900 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Logo size={48} />
          </div>
          <CardTitle className="text-2xl font-display text-canola">
            Join Bushel Board
          </CardTitle>
          <CardDescription>
            Create your farm dashboard in 30 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="farmerName">Your Name</Label>
              <Input
                id="farmerName"
                type="text"
                placeholder="John Smith"
                value={farmerName}
                onChange={(e) => setFarmerName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="farmName">Farm Name</Label>
              <Input
                id="farmName"
                type="text"
                placeholder="Smith Family Farm"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input
                id="postalCode"
                type="text"
                placeholder="T0C 2V0"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                required
                maxLength={7}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="farmer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
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
              {loading ? "Creating your farm..." : "Create Account"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-canola hover:underline font-medium"
              >
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
