"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { UnlockModal } from "./unlock-modal";

interface LockedGrainCardProps {
  grain: string;
}

export function LockedGrainCard({ grain }: LockedGrainCardProps) {
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
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
