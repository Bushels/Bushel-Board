"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, Wheat, Sprout, Droplets, FlaskConical, Building2 } from "lucide-react";
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

type AccountRole = "farmer" | "observer" | "elevator" | "seed" | "fertilizer" | "chemical" | "equipment" | "service";

const OPERATOR_ROLES = new Set<AccountRole>(["elevator", "seed", "fertilizer", "chemical"]);
const GRAIN_BUYER_ROLES = new Set<AccountRole>(["elevator"]);

const OPERATOR_SUB_OPTIONS: Array<{ role: AccountRole; label: string; icon: typeof Sprout }> = [
  { role: "elevator", label: "Elevator / Processor", icon: Building2 },
  { role: "seed", label: "Seed Company", icon: Sprout },
  { role: "fertilizer", label: "Fertilizer Dealer", icon: Droplets },
  { role: "chemical", label: "Chemical Company", icon: FlaskConical },
];

const FACILITY_TYPES = ["elevator", "crusher", "mill", "terminal"] as const;

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
  // Operator-specific fields
  const [companyName, setCompanyName] = useState("");
  const [serviceAreaFsa, setServiceAreaFsa] = useState("");
  const [facilityType, setFacilityType] = useState<string>("elevator");
  const [productLine, setProductLine] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isFarmer = role === "farmer";
  const isOperator = OPERATOR_ROLES.has(role);
  const isGrainBuyer = GRAIN_BUYER_ROLES.has(role);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    // Parse FSA codes from comma-separated input (operators only)
    const parsedFsaCodes = isOperator
      ? serviceAreaFsa
          .split(",")
          .map((s) => s.trim().toUpperCase().slice(0, 3))
          .filter((s) => /^[A-Z]\d[A-Z]$/.test(s))
          .slice(0, 3)
      : [];

    // Parse product line from comma-separated input
    const parsedProducts = productLine
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Determine the role to store — grain buyers use their facility_type
    const effectiveRole = isGrainBuyer ? facilityType : role;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: effectiveRole,
          ...(isFarmer ? { farm_name: farmName, farmer_name: farmerName } : {}),
          ...(isOperator
            ? {
                company_name: companyName,
                facility_name: isGrainBuyer ? companyName : undefined,
                facility_type: isGrainBuyer ? facilityType : undefined,
                facility_postal_code: postalCode.trim().toUpperCase(),
                provider_type: isGrainBuyer ? undefined : role,
                service_area_fsa: parsedFsaCodes,
                products: parsedProducts.length > 0 ? parsedProducts : undefined,
              }
            : {}),
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      const profileUpdate: Record<string, unknown> = { role: effectiveRole };
      if (isFarmer) {
        profileUpdate.farm_name = farmName;
        profileUpdate.farmer_name = farmerName;
        profileUpdate.postal_code = postalCode.trim().toUpperCase();
      }
      if (isOperator) {
        profileUpdate.company_name = companyName;
        if (isGrainBuyer) {
          profileUpdate.facility_name = companyName;
          profileUpdate.facility_type = facilityType;
        } else {
          profileUpdate.provider_type = role;
        }
        profileUpdate.postal_code = postalCode.trim().toUpperCase();
        profileUpdate.facility_postal_code = postalCode.trim().toUpperCase();
        profileUpdate.service_area_fsa = parsedFsaCodes;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", authData.user.id);

      if (profileError) {
        console.error("Profile update error:", profileError.message);
      }
    }

    router.replace(isFarmer ? "/my-farm" : isOperator ? "/chat" : "/overview");
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
            Join Bushels
          </CardTitle>
          <CardDescription>
            {isFarmer
              ? "Create your account now. Crop setup comes next on My Farm."
              : isOperator
                ? "Post your prices daily. Farmers in your area will see them."
                : "Browse prairie grain market intelligence."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label>I am a</Label>
              <div className="grid grid-cols-3 gap-2">
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
                  Farmer
                </button>
                <button
                  type="button"
                  onClick={() => setRole("elevator")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all",
                    isOperator
                      ? "border-canola bg-canola/10 text-foreground ring-1 ring-canola/30"
                      : "border-border/50 bg-background text-muted-foreground hover:border-canola/50 hover:bg-canola/5"
                  )}
                >
                  <Building2 className="h-4 w-4" />
                  Operator
                </button>
                <button
                  type="button"
                  onClick={() => setRole("observer")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all",
                    role === "observer"
                      ? "border-canola bg-canola/10 text-foreground ring-1 ring-canola/30"
                      : "border-border/50 bg-background text-muted-foreground hover:border-canola/50 hover:bg-canola/5"
                  )}
                >
                  <Eye className="h-4 w-4" />
                  Browse
                </button>
              </div>
              {isFarmer && (
                <p className="text-xs text-muted-foreground">
                  Your crop data comes next. Add one crop on My Farm to unlock tailored AI, pace tracking, and grain-specific insight.
                </p>
              )}
              {isOperator && (
                <div className="space-y-2 pt-1">
                  <Label className="text-xs text-muted-foreground">What type of business?</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {OPERATOR_SUB_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.role}
                          type="button"
                          onClick={() => setRole(opt.role)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all",
                            role === opt.role
                              ? "border-canola bg-canola/10 text-foreground"
                              : "border-border/30 text-muted-foreground hover:border-canola/40"
                          )}
                        >
                          <Icon className="h-3 w-3 shrink-0" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {role === "observer" && (
                <p className="text-xs text-muted-foreground">
                  Observers can view dashboards and market data. Upgrade to a farmer account anytime.
                </p>
              )}
            </div>

            {/* Farmer-specific fields */}
            {isFarmer && (
              <div className="space-y-4">
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
              </div>
            )}

            {/* Operator-specific fields */}
            {isOperator && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">
                    {isGrainBuyer ? "Facility Name" : "Company Name"}
                  </Label>
                  <Input
                    id="companyName"
                    type="text"
                    placeholder={isGrainBuyer ? "Richardson Kindersley" : "Prairie Ag Supply"}
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                {isGrainBuyer && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Facility Type</Label>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {FACILITY_TYPES.map((ft) => (
                        <button
                          key={ft}
                          type="button"
                          onClick={() => setFacilityType(ft)}
                          className={cn(
                            "rounded-md border px-2.5 py-1.5 text-xs font-medium capitalize transition-all",
                            facilityType === ft
                              ? "border-canola bg-canola/10 text-foreground"
                              : "border-border/30 text-muted-foreground hover:border-canola/40"
                          )}
                        >
                          {ft}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Location (Postal Code)</Label>
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
                  <Label htmlFor="serviceArea">Areas You Serve (FSA codes)</Label>
                  <Input
                    id="serviceArea"
                    type="text"
                    placeholder="T0L, T0K, T0C"
                    value={serviceAreaFsa}
                    onChange={(e) => setServiceAreaFsa(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    First 3 characters of postal codes you serve, comma-separated. Max 3.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productLine">
                    {isGrainBuyer ? "What grains do you buy?" : "What products do you sell?"}
                  </Label>
                  <Input
                    id="productLine"
                    type="text"
                    placeholder={isGrainBuyer ? "Wheat, Canola, Barley, Oats" : "Urea, MAP, Glyphosate, InVigor L233P"}
                    value={productLine}
                    onChange={(e) => setProductLine(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated. These seed your product catalog — you can add more later via chat.
                  </p>
                </div>
              </div>
            )}

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
                autoFocus={!isFarmer && !isOperator}
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
                  : isOperator
                    ? "Setting up your account..."
                    : "Setting up access..."
                : isFarmer
                  ? "Create Farm Account"
                  : isOperator
                    ? "Create Operator Account"
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
