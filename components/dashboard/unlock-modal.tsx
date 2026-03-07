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
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

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
        crop_year: CURRENT_CROP_YEAR,
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
                Add {grain} to your crop plan to unlock its intelligence dashboard. We keep your Overview focused on the crops that matter to your farm.
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
