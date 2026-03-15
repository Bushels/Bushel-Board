"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { ArrowRight, Lock } from "lucide-react";

interface UnlockModalProps {
  grain: string;
  onClose: () => void;
}

export function UnlockModal({ grain, onClose }: UnlockModalProps) {
  const [acres, setAcres] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const params = new URLSearchParams({ grain });
    if (acres.trim()) {
      params.set("acres", acres.trim());
    }
    router.push(`/my-farm?${params.toString()}#crop-setup`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg font-display">
            Unlock {grain}
          </CardTitle>
          <CardDescription>
            Crop setup now finishes in My Farm. Acres get prefilled there, then you add
            starting grain and grain left to sell so the percentages stay accurate.
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
                className="flex-1 bg-canola text-white hover:bg-canola-dark"
                disabled={loading || !acres}
              >
                {loading ? "Opening..." : "Continue to Setup"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
