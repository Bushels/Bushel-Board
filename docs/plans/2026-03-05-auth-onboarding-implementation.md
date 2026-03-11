# Auth Overhaul + Farmer Onboarding + Crop-Gated Unlocks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace magic link auth with email/password, add signup with farm info, and implement crop-gated grain unlocks where farmers only access grain detail pages for crops they've added to their plan.

**Architecture:** Password auth via Supabase `signUp`/`signInWithPassword`. Expanded profiles table stores farm info. New `crop_plans` table stores per-crop acreage. Dashboard splits into "Your Crops" (unlocked) and "Other Grains" (locked). Grain detail pages check unlock status server-side.

**Tech Stack:** Next.js 16 (App Router), Supabase Auth (email/password), @supabase/ssr, shadcn/ui, Tailwind CSS (wheat palette)

**Design Doc:** `docs/plans/2026-03-05-auth-onboarding-design.md`

**Project Dir:** `c:/Users/kyle/Agriculture/bushel-board-app/`

## 2026-03-11 Auth/Nav Polish Addendum

Shipped follow-up polish after the original auth rollout:

- Moved authenticated `/` handling from client-side landing-page logic to a server redirect in `app/page.tsx` to eliminate the prairie landing flash for signed-in users.
- Updated the dashboard header brand in `components/layout/nav.tsx` to use the compact mark and route to the signed-in user's role-aware home instead of `/`.
- Added a shared prairie auth shell in `components/auth/` with prairie-time day/evening variants backed by `lib/auth/auth-scene.ts`.
- Applied the shared shell to login, signup, reset-password, and update-password.
- Added test coverage for the prairie-time scene switch in `tests/lib/auth-scene.test.ts`.

---

## Agent Assignment

This plan is designed for parallel execution:

**Workstream A — Database (Task 1)**
Agent: db-architect

**Workstream B — Auth Pages (Tasks 2-4)**
Agent: auth-engineer

**Workstream C — Unlock System + Dashboard Overhaul (Tasks 5-9)**
Agent: frontend-dev

**Dependency graph:**
```
A (Task 1) ──→ B (Tasks 2-4)
           ──→ C (Tasks 5-9)
```

---

### Task 1: Database Migrations

**Files:**
- Create: `supabase/migrations/20260305200000_profile_expansion.sql`
- Create: `supabase/migrations/20260305200100_crop_plans.sql`

**Step 1: Create profile expansion migration**

Create `supabase/migrations/20260305200000_profile_expansion.sql`:

```sql
-- Expand profiles table for farmer onboarding
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS farm_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS farmer_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_acres int;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

-- Allow service role to insert profiles (for signup flow)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Service role can insert profiles'
  ) THEN
    CREATE POLICY "Service role can insert profiles"
      ON profiles FOR INSERT
      WITH CHECK (true);
  END IF;
END
$$;
```

**Step 2: Create crop_plans migration**

Create `supabase/migrations/20260305200100_crop_plans.sql`:

```sql
-- Crop plans: tracks which grains a farmer grows and their acreage
CREATE TABLE IF NOT EXISTS crop_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  crop_year text NOT NULL,
  grain text NOT NULL,
  acres_seeded int NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, crop_year, grain)
);

CREATE INDEX IF NOT EXISTS idx_crop_plans_user_year ON crop_plans(user_id, crop_year);

ALTER TABLE crop_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own crop plans"
  ON crop_plans FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own crop plans"
  ON crop_plans FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own crop plans"
  ON crop_plans FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own crop plans"
  ON crop_plans FOR DELETE USING (auth.uid() = user_id);
```

**Step 3: Push migrations**

Run:
```bash
cd "c:/Users/kyle/Agriculture/bushel-board-app"
npx supabase db push
```

Expected: Both migrations applied successfully.

**Step 4: Commit**

```bash
git add supabase/migrations/20260305200000_profile_expansion.sql supabase/migrations/20260305200100_crop_plans.sql
git commit -m "feat: add profile expansion and crop_plans table migrations"
```

---

### Task 2: Province Utility + Crop Plan Queries

**Files:**
- Create: `lib/utils/province.ts`
- Create: `lib/queries/crop-plans.ts`

**Step 1: Create province utility**

Create `lib/utils/province.ts`:

```typescript
const POSTAL_PREFIX_TO_PROVINCE: Record<string, string> = {
  T: "AB",
  S: "SK",
  R: "MB",
  V: "BC",
  K: "ON",
  L: "ON",
  M: "ON",
  N: "ON",
  P: "ON",
};

export function getProvinceFromPostalCode(
  postalCode: string
): string | null {
  if (!postalCode || postalCode.length === 0) return null;
  const firstChar = postalCode.trim().toUpperCase().charAt(0);
  return POSTAL_PREFIX_TO_PROVINCE[firstChar] ?? null;
}

export function getProvinceLabel(code: string): string {
  const labels: Record<string, string> = {
    AB: "Alberta",
    SK: "Saskatchewan",
    MB: "Manitoba",
    BC: "British Columbia",
    ON: "Ontario",
  };
  return labels[code] ?? code;
}
```

**Step 2: Create crop plan queries**

Create `lib/queries/crop-plans.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";

export interface CropPlan {
  id: string;
  user_id: string;
  crop_year: string;
  grain: string;
  acres_seeded: number;
}

/**
 * Get all crop plans for a user in a given crop year.
 */
export async function getUserCropPlans(
  userId: string,
  cropYear: string = "2025-2026"
): Promise<CropPlan[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("crop_plans")
      .select("*")
      .eq("user_id", userId)
      .eq("crop_year", cropYear);

    if (error) {
      console.error("getUserCropPlans error:", error.message);
      return [];
    }
    return (data as CropPlan[]) || [];
  } catch (err) {
    console.error("getUserCropPlans failed:", err);
    return [];
  }
}

/**
 * Get the list of grain names a user has unlocked.
 */
export async function getUserUnlockedGrains(
  userId: string,
  cropYear: string = "2025-2026"
): Promise<string[]> {
  const plans = await getUserCropPlans(userId, cropYear);
  return plans.map((p) => p.grain);
}

/**
 * Check if a specific grain is unlocked for a user.
 */
export function isGrainUnlocked(
  unlockedGrains: string[],
  grainName: string
): boolean {
  return unlockedGrains.includes(grainName);
}
```

**Step 3: Commit**

```bash
git add lib/utils/province.ts lib/queries/crop-plans.ts
git commit -m "feat: add province utility and crop plan query layer"
```

---

### Task 3: Replace Login Page + Add Signup Page

**Files:**
- Modify: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/signup/page.tsx`
- Create: `app/(auth)/reset-password/page.tsx`
- Modify: `lib/supabase/middleware.ts` (add public routes)

**Step 1: Replace login page with password auth**

Replace entire contents of `app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
    } else {
      router.push("/overview");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-wheat-50 dark:bg-wheat-900 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-display text-canola">
            Bushel Board
          </CardTitle>
          <CardDescription>
            Sign in to your farm dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
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
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/reset-password"
                  className="text-xs text-muted-foreground hover:text-canola transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
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
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-canola hover:underline font-medium"
              >
                Sign up
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Create signup page**

Create `app/(auth)/signup/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
```

**Step 3: Create password reset page**

Create `app/(auth)/reset-password/page.tsx`:

```tsx
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
      { redirectTo: `${window.location.origin}/callback` }
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
```

**Step 4: Update middleware to add public routes**

Modify `lib/supabase/middleware.ts` — add `/signup` and `/reset-password` to the public routes check. Change line 38 from:

```typescript
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/callback") &&
    request.nextUrl.pathname !== "/"
```

to:

```typescript
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/signup") &&
    !request.nextUrl.pathname.startsWith("/reset-password") &&
    !request.nextUrl.pathname.startsWith("/callback") &&
    request.nextUrl.pathname !== "/"
```

**Step 5: Update landing page links**

Modify `app/page.tsx` — change the "Get Started" CTA from `/login` to `/signup`. The header "Sign In" link stays as `/login`.

Change line 53:
```tsx
          <Link href="/signup">
```

**Step 6: Verify build**

Run:
```bash
cd "c:/Users/kyle/Agriculture/bushel-board-app"
npm run build
```

Expected: Build succeeds with new routes `/signup` and `/reset-password` visible.

**Step 7: Commit**

```bash
git add app/(auth)/login/page.tsx app/(auth)/signup/page.tsx app/(auth)/reset-password/page.tsx lib/supabase/middleware.ts app/page.tsx
git commit -m "feat: replace magic link with password auth, add signup and reset pages"
```

---

### Task 4: Unlock Modal Component

**Files:**
- Create: `components/dashboard/unlock-modal.tsx`

**Step 1: Create the unlock modal**

Create `components/dashboard/unlock-modal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Lock, Sparkles } from "lucide-react";

interface UnlockModalProps {
  grain: string;
  slug: string;
  onClose: () => void;
}

export function UnlockModal({ grain, slug, onClose }: UnlockModalProps) {
  const [acres, setAcres] = useState("");
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in.");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("crop_plans").upsert(
      {
        user_id: user.id,
        crop_year: "2025-2026",
        grain,
        acres_seeded: parseInt(acres, 10),
      },
      { onConflict: "user_id,crop_year,grain" }
    );

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    // Show celebration briefly, then navigate
    setUnlocked(true);
    setTimeout(() => {
      router.push(`/grain/${slug}`);
      router.refresh();
    }, 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <Card className="w-full max-w-sm">
        {unlocked ? (
          <CardContent className="py-12 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-canola/10 animate-bounce">
              <Sparkles className="h-8 w-8 text-canola" />
            </div>
            <p className="text-xl font-display font-semibold text-canola">
              You&apos;ve unlocked {grain} data!
            </p>
            <p className="text-sm text-muted-foreground">
              Loading your personalized dashboard...
            </p>
          </CardContent>
        ) : (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <CardTitle className="text-lg font-display">
                Unlock {grain}
              </CardTitle>
              <CardDescription>
                Add {grain} to your 2026 crop plan to access detailed market data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUnlock} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="acres">Acres seeded</Label>
                  <Input
                    id="acres"
                    type="number"
                    placeholder="e.g. 10500"
                    value={acres}
                    onChange={(e) => setAcres(e.target.value)}
                    required
                    min={1}
                    autoFocus
                  />
                </div>
                {error && (
                  <p className="text-sm text-error">{error}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={onClose}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-canola hover:bg-canola-dark text-white"
                    disabled={loading || !acres}
                  >
                    {loading ? "Unlocking..." : "Unlock"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/dashboard/unlock-modal.tsx
git commit -m "feat: add crop unlock modal with celebration animation"
```

---

### Task 5: Locked Grain Card Component

**Files:**
- Create: `components/dashboard/locked-grain-card.tsx`

**Step 1: Create locked grain card**

Create `components/dashboard/locked-grain-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { UnlockModal } from "./unlock-modal";

interface LockedGrainCardProps {
  grain: string;
  slug: string;
}

export function LockedGrainCard({ grain, slug }: LockedGrainCardProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Card
        className="relative cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:border-canola/30 overflow-hidden"
        onClick={() => setShowModal(true)}
      >
        {/* Blurred overlay */}
        <div className="absolute inset-0 backdrop-blur-[2px] bg-background/60 z-10 flex flex-col items-center justify-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            Add to crop plan
          </span>
        </div>
        {/* Placeholder content behind blur */}
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-body font-medium flex items-center justify-between">
            {grain}
            <Badge variant="secondary" className="text-muted-foreground">
              Locked
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Crop Year Deliveries</span>
            <span className="tabular-nums font-medium text-muted-foreground/50">
              ---
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">This Week</span>
            <span className="tabular-nums font-medium text-muted-foreground/50">
              ---
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted" />
        </CardContent>
      </Card>

      {showModal && (
        <UnlockModal
          grain={grain}
          slug={slug}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
```

**Step 2: Commit**

```bash
git add components/dashboard/locked-grain-card.tsx
git commit -m "feat: add locked grain card with blur overlay and unlock trigger"
```

---

### Task 6: Overhaul Dashboard Overview Page

**Files:**
- Modify: `app/(dashboard)/overview/page.tsx`

**Step 1: Rewrite overview page with unlock sections**

Replace entire contents of `app/(dashboard)/overview/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getGrainOverview, getGrainList } from "@/lib/queries/grains";
import { getUserUnlockedGrains } from "@/lib/queries/crop-plans";
import { PipelineCard } from "@/components/dashboard/pipeline-card";
import { LockedGrainCard } from "@/components/dashboard/locked-grain-card";
import { GrainTable } from "@/components/dashboard/grain-table";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [grains, allGrains, unlockedGrains] = await Promise.all([
    getGrainOverview(),
    getGrainList(),
    user ? getUserUnlockedGrains(user.id) : Promise.resolve([]),
  ]);

  const myGrains = grains.filter((g) => unlockedGrains.includes(g.grain));
  const otherGrains = allGrains.filter(
    (g) => !unlockedGrains.includes(g.name)
  );

  return (
    <div className="space-y-8">
      {/* Overview — aggregate stats everyone sees */}
      <div>
        <h1 className="text-2xl font-display font-semibold">
          Supply Pipeline
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crop year 2025-26 · Western Canada primary elevator activity
        </p>
      </div>

      {/* Your Crops — unlocked grains */}
      {myGrains.length > 0 && (
        <div>
          <h2 className="text-lg font-display font-semibold mb-4">
            Your Crops
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {myGrains.map((g) => (
              <PipelineCard
                key={g.slug}
                grain={g.grain}
                slug={g.slug}
                cyDeliveries={g.cy_deliveries_kt}
                cwDeliveries={g.cw_deliveries_kt}
                wowChange={g.wow_pct_change}
              />
            ))}
          </div>
        </div>
      )}

      {/* Prompt to add crops if none unlocked */}
      {myGrains.length === 0 && grains.length > 0 && (
        <div className="rounded-lg border-2 border-dashed border-canola/30 bg-canola/5 p-8 text-center">
          <p className="font-display font-semibold text-lg">
            Unlock your grain data
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Add crops to your 2026 plan below to access detailed market
            intelligence. Click any locked grain to get started.
          </p>
        </div>
      )}

      {/* No data fallback */}
      {grains.length === 0 && (
        <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
          <p className="font-medium">No grain data yet</p>
          <p className="text-sm mt-1">
            Run{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
              npm run backfill
            </code>{" "}
            to load CGC data into Supabase.
          </p>
        </div>
      )}

      {/* All Grains Table — only unlocked grains are clickable */}
      {myGrains.length > 0 && (
        <div>
          <h2 className="text-lg font-display font-semibold mb-4">
            All Grains
          </h2>
          <GrainTable data={myGrains} />
        </div>
      )}

      {/* Other Grains — locked cards */}
      {otherGrains.length > 0 && (
        <div>
          <h2 className="text-lg font-display font-semibold mb-4">
            Other Grains
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {otherGrains.map((g) => (
              <LockedGrainCard key={g.slug} grain={g.name} slug={g.slug} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run:
```bash
npm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add app/(dashboard)/overview/page.tsx
git commit -m "feat: split dashboard into Your Crops (unlocked) and Other Grains (locked)"
```

---

### Task 7: Grain Detail Page Access Control

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx`

**Step 1: Add unlock check to grain detail page**

Add access control at the top of the `GrainDetailPage` function. After the existing `getGrainBySlug` call, add an unlock check. If the grain is not unlocked, show the unlock prompt instead of the data.

At the top of the file, add these imports:

```typescript
import { createClient } from "@/lib/supabase/server";
import { getUserUnlockedGrains, isGrainUnlocked } from "@/lib/queries/crop-plans";
```

After line 24 (`if (!grain) notFound();`), add:

```typescript
  // Check if user has unlocked this grain
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const unlockedGrains = await getUserUnlockedGrains(user.id);
    if (!isGrainUnlocked(unlockedGrains, grain.name)) {
      return <GrainLockedView grain={grain.name} slug={slug} />;
    }
  }
```

At the bottom of the file, add the locked view component:

```tsx
function GrainLockedView({ grain, slug }: { grain: string; slug: string }) {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/overview">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-semibold">{grain}</h1>
          <p className="text-sm text-muted-foreground">
            Crop Year 2025-26 · Weekly Statistics
          </p>
        </div>
      </div>

      <div className="rounded-lg border-2 border-dashed border-canola/30 bg-canola/5 p-12 text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="font-display font-semibold text-xl">
          {grain} data is locked
        </p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Add {grain} to your 2026 crop plan to unlock detailed charts,
          provincial breakdowns, and weekly trend analysis.
        </p>
        <GrainUnlockButton grain={grain} slug={slug} />
      </div>
    </div>
  );
}
```

Also add a `"use client"` unlock button component in a new file `components/dashboard/grain-unlock-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { UnlockModal } from "./unlock-modal";
import { Button } from "@/components/ui/button";

export function GrainUnlockButton({
  grain,
  slug,
}: {
  grain: string;
  slug: string;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button
        className="bg-canola hover:bg-canola-dark text-white"
        onClick={() => setShowModal(true)}
      >
        Add {grain} to crop plan
      </Button>
      {showModal && (
        <UnlockModal
          grain={grain}
          slug={slug}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
```

Import `Lock` from lucide-react and `GrainUnlockButton` at the top of the grain detail page.

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add app/(dashboard)/grain/[slug]/page.tsx components/dashboard/grain-unlock-button.tsx
git commit -m "feat: add crop-gated access control to grain detail page"
```

---

### Task 8: Update Landing Page CTA

**Files:**
- Modify: `app/page.tsx`

**Step 1: Update CTA links**

In `app/page.tsx`, change the "Get Started" button (line 53) from `/login` to `/signup`:

```tsx
          <Link href="/signup">
            <Button
              size="lg"
              className="bg-canola hover:bg-canola-dark text-white"
            >
              Get Started
            </Button>
          </Link>
```

**Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: update landing page CTA to point to signup"
```

---

### Task 9: Final Verification + Deploy

**Step 1: Full build check**

Run:
```bash
cd "c:/Users/kyle/Agriculture/bushel-board-app"
npm run build
```

Expected: Build succeeds. All routes present:
- `/` (dynamic — auth check)
- `/login` (static)
- `/signup` (static)
- `/reset-password` (static)
- `/callback` (dynamic)
- `/overview` (dynamic)
- `/grains` (dynamic)
- `/grain/[slug]` (dynamic)

**Step 2: Push migrations**

Run:
```bash
npx supabase db push
```

**Step 3: Deploy to Vercel**

Run:
```bash
npx vercel --prod --yes
```

Expected: Deployment succeeds.

**Step 4: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: auth overhaul + farmer onboarding + crop-gated unlocks"
```
