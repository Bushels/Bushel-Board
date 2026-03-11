"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, Wheat } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth/auth-shell";
import { Logo } from "@/components/layout/logo";
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
import type { AuthScene } from "@/lib/auth/auth-scene";
import { cn } from "@/lib/utils";

type AccountRole = "farmer" | "observer";

interface SignupFormProps {
  scene: AuthScene;
}

export function SignupForm({ scene }: SignupFormProps) {
  const [role, setRole] = useState<AccountRole>("farmer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [farmName, setFarmName] = useState("");
  const [farmerName, setFarmerName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isFarmer = role === "farmer";

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          ...(isFarmer ? { farm_name: farmName, farmer_name: farmerName } : {}),
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      const profileUpdate: Record<string, string> = { role };
      if (isFarmer) {
        profileUpdate.farm_name = farmName;
        profileUpdate.farmer_name = farmerName;
        profileUpdate.postal_code = postalCode.trim().toUpperCase();
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", authData.user.id);

      if (profileError) {
        console.error("Profile update error:", profileError.message);
      }
    }

    router.replace(isFarmer ? "/my-farm" : "/overview");
    router.refresh();
  }

  return (
    <AuthShell scene={scene} modeLabel="Sign up">
      <Card className="w-full border-white/50 bg-background/90 shadow-[0_28px_80px_-42px_rgba(42,38,30,0.72)] backdrop-blur-2xl dark:border-white/10 dark:bg-wheat-900/90">
        <CardHeader className="text-center">
          <div className="mb-3 flex justify-center">
            <div className="flex size-14 items-center justify-center rounded-full border border-canola/20 bg-canola/10">
              <Logo variant="mark" size={26} />
            </div>
          </div>
          <CardTitle className="text-2xl font-display text-canola">
            Join Bushel Board
          </CardTitle>
          <CardDescription>
            {isFarmer
              ? "Create your account now. Crop setup comes next on My Farm."
              : "Browse prairie grain market intelligence."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label>I want to</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole("farmer")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all",
                    isFarmer
                      ? "border-canola bg-canola/10 text-foreground ring-1 ring-canola/30"
                      : "border-border/50 bg-background text-muted-foreground hover:border-canola/50 hover:bg-canola/5"
                  )}
                >
                  <Wheat className="h-4 w-4" />
                  Farm & Track
                </button>
                <button
                  type="button"
                  onClick={() => setRole("observer")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all",
                    !isFarmer
                      ? "border-canola bg-canola/10 text-foreground ring-1 ring-canola/30"
                      : "border-border/50 bg-background text-muted-foreground hover:border-canola/50 hover:bg-canola/5"
                  )}
                >
                  <Eye className="h-4 w-4" />
                  Just Browse
                </button>
              </div>
              {!isFarmer && (
                <p className="text-xs text-muted-foreground">
                  Observers can view dashboards and market data. Upgrade to a farmer account anytime.
                </p>
              )}
              {isFarmer && (
                <p className="text-xs text-muted-foreground">
                  Your crop data comes next. Add one crop on My Farm to unlock tailored AI, pace tracking, and grain-specific insight.
                </p>
              )}
            </div>

            <div
              className={cn(
                "space-y-4 transition-all duration-300",
                !isFarmer && "pointer-events-none opacity-40"
              )}
            >
              <div className="space-y-2">
                <Label htmlFor="farmerName">Your Name</Label>
                <Input
                  id="farmerName"
                  type="text"
                  placeholder="John Smith"
                  value={farmerName}
                  onChange={(e) => setFarmerName(e.target.value)}
                  required={isFarmer}
                  autoFocus={isFarmer}
                  tabIndex={isFarmer ? 0 : -1}
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
                  required={isFarmer}
                  tabIndex={isFarmer ? 0 : -1}
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
                  required={isFarmer}
                  maxLength={7}
                  tabIndex={isFarmer ? 0 : -1}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder={isFarmer ? "farmer@example.com" : "you@example.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus={!isFarmer}
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
            {error && <p className="text-sm text-error">{error}</p>}
            <Button
              type="submit"
              className="w-full bg-canola text-white hover:bg-canola-dark"
              disabled={loading}
            >
              {loading
                ? isFarmer
                  ? "Creating your farm..."
                  : "Setting up access..."
                : isFarmer
                  ? "Create Farm Account"
                  : "Create Observer Account"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-canola hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
